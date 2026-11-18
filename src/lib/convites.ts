// Convites pessoais: um link por pessoa, casal ou família, com o número de lugares.
// O link (/c/<id>) abre o convite sem código e é também o link para alterar a resposta.
import { agoraIso, db, lerConfig, tokenAleatorio } from './seguranca';

export const MAX_LUGARES = 10;
export const MAX_MENSAGEM = 600;

export interface Convite {
  id: string;
  nome: string;
  lugares: number;
  email: string | null;
  telefone: string | null;
  email_enviado_em: string | null;
  whatsapp_em: string | null;
  desativado_em: string | null;
  criado_em: string;
}

/** Convite com o estado da resposta, para a lista do dashboard. */
export interface ConviteComResposta extends Convite {
  rsvp_id: number | null;
  vai: 0 | 1 | null;
  pessoas: number | null;
  respondido_em: string | null;
}

export const urlConvite = (origem: string, id: string) => `${origem}/c/${id}`;

/** Email simples: só confirma que tem "@" e um ponto no domínio. */
export function limparEmail(v: unknown): string | null | false {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  return s.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) ? s : false;
}

/** Telefone em dígitos com indicativo. Números portugueses de 9 dígitos ganham o 351. */
export function limparTelefone(v: unknown): string | null | false {
  const bruto = String(v ?? '').trim();
  if (!bruto) return null;
  let d = bruto.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^[29]\d{8}$/.test(d)) d = `351${d}`;
  d = d.replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : false;
}

export async function listarConvites(): Promise<ConviteComResposta[]> {
  const { results } = await db()
    .prepare(
      `SELECT c.*, r.id AS rsvp_id, r.vai, CASE WHEN r.vai = 1 THEN r.acompanhantes + 1 ELSE 0 END AS pessoas,
         COALESCE(r.atualizado_em, r.criado_em) AS respondido_em
       FROM convites c LEFT JOIN rsvps r ON r.convite_id = c.id
       ORDER BY c.criado_em DESC, c.nome`,
    )
    .all<ConviteComResposta>();
  return results;
}

export async function lerConvite(id: string): Promise<Convite | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(id)) return null;
  return db().prepare('SELECT * FROM convites WHERE id = ?1').bind(id).first<Convite>();
}

export async function criarConvites(
  linhas: { nome: string; lugares: number; email: string | null; telefone: string | null }[],
): Promise<number> {
  if (!linhas.length) return 0;
  const d = db();
  await d.batch(
    linhas.map((l) =>
      d
        .prepare('INSERT INTO convites (id, nome, lugares, email, telefone, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(tokenAleatorio(), l.nome, l.lugares, l.email, l.telefone, agoraIso()),
    ),
  );
  return linhas.length;
}

export async function editarConvite(
  id: string,
  v: { nome: string; lugares: number; email: string | null; telefone: string | null },
): Promise<void> {
  // Se o email mudar, volta a contar como "por enviar".
  await db()
    .prepare(
      `UPDATE convites SET nome = ?2, lugares = ?3, telefone = ?5,
         email_enviado_em = CASE WHEN email IS ?4 THEN email_enviado_em ELSE NULL END,
         email = ?4
       WHERE id = ?1`,
    )
    .bind(id, v.nome, v.lugares, v.email, v.telefone)
    .run();
}

export async function ativarConvite(id: string, ativo: boolean): Promise<void> {
  await db()
    .prepare('UPDATE convites SET desativado_em = ?2 WHERE id = ?1')
    .bind(id, ativo ? null : agoraIso())
    .run();
}

/** Apaga o convite. A resposta, se houver, fica (passa a contar como resposta sem convite). */
export async function apagarConvite(id: string): Promise<void> {
  const d = db();
  await d.batch([
    d.prepare('UPDATE rsvps SET convite_id = NULL WHERE convite_id = ?1').bind(id),
    d.prepare('DELETE FROM convites WHERE id = ?1').bind(id),
  ]);
}

export async function marcarWhatsapp(id: string): Promise<void> {
  await db().prepare('UPDATE convites SET whatsapp_em = ?2 WHERE id = ?1').bind(id, agoraIso()).run();
}

export async function marcarEmails(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const d = db();
  const agora = agoraIso();
  await d.batch(ids.map((id) => d.prepare('UPDATE convites SET email_enviado_em = ?2 WHERE id = ?1').bind(id, agora)));
}

/* ---------- mensagem que acompanha o link ---------- */

// Serve tanto para uma pessoa ("Maria") como para uma família ("Família Silva"): não usa "tu" nem "vocês".
export const MENSAGEM_SUGERIDA =
  'Vamos casar e gostávamos muito de celebrar este dia com quem faz parte da nossa história: 5 de setembro de 2027, na Quinta da Serralheira, em Palmela.';

export async function lerMensagem(): Promise<{ texto: string; propria: boolean }> {
  const m = (await lerConfig('mensagem'))?.trim();
  return { texto: m || MENSAGEM_SUGERIDA, propria: !!m };
}

export const saudacao = (nome: string) => `Olá, ${nome}!`;
export const linhaLugares = (lugares: number) =>
  lugares > 1 ? `Este convite é para ${lugares} pessoas: uma só resposta chega para todos.` : '';
export const LINHA_LINK = 'Convite e confirmação de presença:';

export function textoWhatsapp(o: { nome: string; lugares: number; mensagem: string; url: string }): string {
  return [saudacao(o.nome), o.mensagem, linhaLugares(o.lugares), `${LINHA_LINK}\n${o.url}`].filter(Boolean).join('\n\n');
}

export const urlWhatsapp = (texto: string, telefone?: string | null) =>
  `https://wa.me/${telefone ?? ''}?text=${encodeURIComponent(texto)}`;
