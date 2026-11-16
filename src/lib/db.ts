import { env } from 'cloudflare:workers';
import { IDADES, type Idade } from './rsvp';

export interface Pessoa {
  ordem: number;
  nome: string;
  restricao: 0 | 1 | null;
  restricao_qual: string;
  /** Escalão de idade (null só em respostas anteriores a esta pergunta). */
  idade: Idade | null;
}

export interface Rsvp {
  id: number;
  nome: string;
  vai: 0 | 1;
  acompanhantes: number;
  criado_em: string;
  email_enviado: 0 | 1;
  /** Quem vai (quem respondeu + acompanhantes). Vazio se não vai. */
  pessoas: Pessoa[];
}

export interface RsvpInput {
  nome: string;
  vai: boolean;
  /** Quem vai: [quem respondeu, ...acompanhantes]. Vazio se não vai. */
  pessoas: Pessoa[];
}

const db = () => (env as Env).DB;

export async function insertRsvp(r: RsvpInput): Promise<number> {
  const d = db();
  // Tudo numa transação: a resposta e as pessoas ficam gravadas juntas ou nada fica.
  const [res] = await d.batch<{ id: number }>([
    d
      .prepare('INSERT INTO rsvps (nome, vai, acompanhantes) VALUES (?1, ?2, ?3) RETURNING id')
      .bind(r.nome, r.vai ? 1 : 0, Math.max(0, r.pessoas.length - 1)),
    ...r.pessoas.map((p) =>
      d
        .prepare(
          `INSERT INTO pessoas (rsvp_id, ordem, nome, restricao, restricao_qual, idade)
           VALUES ((SELECT MAX(id) FROM rsvps), ?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(p.ordem, p.nome, p.restricao, p.restricao_qual, p.idade),
    ),
  ]);
  return res.results[0].id;
}

export async function markEmailSent(id: number): Promise<void> {
  await db().prepare('UPDATE rsvps SET email_enviado = 1 WHERE id = ?1').bind(id).run();
}

export async function listRsvps(): Promise<Rsvp[]> {
  const d = db();
  const [rsvps, pessoas] = await d.batch([
    d.prepare('SELECT id, nome, vai, acompanhantes, criado_em, email_enviado FROM rsvps ORDER BY criado_em DESC, id DESC'),
    d.prepare('SELECT rsvp_id, ordem, nome, restricao, restricao_qual, idade FROM pessoas ORDER BY rsvp_id, ordem'),
  ]);
  const porRsvp = new Map<number, Pessoa[]>();
  for (const p of pessoas.results as (Pessoa & { rsvp_id: number })[]) {
    const { rsvp_id, ...pessoa } = p;
    porRsvp.set(rsvp_id, [...(porRsvp.get(rsvp_id) ?? []), pessoa]);
  }
  return (rsvps.results as Omit<Rsvp, 'pessoas'>[]).map((r) => ({ ...r, pessoas: porRsvp.get(r.id) ?? [] }));
}

export async function deleteRsvp(id: number): Promise<void> {
  const d = db();
  await d.batch([
    d.prepare('DELETE FROM pessoas WHERE rsvp_id = ?1').bind(id),
    d.prepare('DELETE FROM rsvps WHERE id = ?1').bind(id),
  ]);
}

export interface PessoaComRestricao {
  nome: string;
  qual: string;
  /** Nome de quem respondeu, quando a pessoa é acompanhante. */
  de?: string;
}

export interface Stats {
  respostas: number;
  vao: number;
  naoVao: number;
  acompanhantes: number;
  totalPessoas: number;
  restricoes: {
    sim: number;
    nao: number;
    semResposta: number;
    /** Disseram que sim mas não escreveram qual. */
    semDetalhe: number;
    lista: PessoaComRestricao[];
  };
  /** Pessoas confirmadas por escalão de idade (pela ordem de IDADES), mais as sem idade indicada. */
  idades: { id: Idade | null; n: number }[];
  porDia: { dia: string; sim: number; nao: number }[];
}

export function computeStats(rows: Rsvp[]): Stats {
  const vao = rows.filter((r) => r.vai === 1);
  const pessoas = vao.flatMap((r) => r.pessoas.map((p) => ({ ...p, de: p.ordem > 0 ? r.nome : undefined })));
  const comRestricao = pessoas.filter((p) => p.restricao === 1);
  const dias = new Map<string, { sim: number; nao: number }>();
  for (const r of rows) {
    const dia = r.criado_em.slice(0, 10);
    const d = dias.get(dia) ?? { sim: 0, nao: 0 };
    if (r.vai) d.sim++;
    else d.nao++;
    dias.set(dia, d);
  }
  const acompanhantes = vao.reduce((n, r) => n + r.acompanhantes, 0);
  return {
    respostas: rows.length,
    vao: vao.length,
    naoVao: rows.length - vao.length,
    acompanhantes,
    totalPessoas: vao.length + acompanhantes,
    restricoes: {
      sim: comRestricao.length,
      nao: pessoas.filter((p) => p.restricao === 0).length,
      semResposta: pessoas.filter((p) => p.restricao === null).length,
      semDetalhe: comRestricao.filter((p) => !p.restricao_qual).length,
      lista: comRestricao.map((p) => ({ nome: p.nome, qual: p.restricao_qual, de: p.de })),
    },
    idades: [
      ...IDADES.map((i) => ({ id: i.id as Idade | null, n: pessoas.filter((p) => p.idade === i.id).length })),
      { id: null, n: pessoas.filter((p) => !p.idade).length },
    ].filter((g) => g.id !== null || g.n > 0),
    porDia: [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, v]) => ({ dia, ...v })),
  };
}

/** Texto curto para a restrição de uma pessoa (tabela, email, CSV). */
export function textoRestricao(p: Pessoa): string {
  if (p.restricao === 1) return p.restricao_qual ? `Sim: ${p.restricao_qual}` : 'Sim (não especificou)';
  if (p.restricao === 0) return 'Não';
  return 'Sem resposta';
}
