import type { APIRoute } from 'astro';
import { waitUntil } from 'cloudflare:workers';
import {
  findRsvpByEdicao,
  insertRsvp,
  markEmailSent,
  updateRsvp,
  type Pessoa,
  type Rsvp,
  type RsvpInput,
} from '../../lib/db';
import { IDADE_ADULTO, MAX_ACOMPANHANTES, idadeValida, interpretarRestricao, limparEmail, rsvpFechado } from '../../lib/rsvp';
import { enviarConfirmacao, sendRsvpEmail } from '../../lib/email';
import { temAcesso } from '../../lib/acesso';
import { ipDe, permitir, sha256, tokenAleatorio } from '../../lib/seguranca';

export const prerender = false;

const clean = (v: FormDataEntryValue | null, max: number) =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Grava uma resposta:
 * - com `edicao`: altera a resposta desse link (/r/<token>, que o convidado recebe ao responder);
 * - sem: resposta nova (precisa do código do convite, se estiver definido).
 */
export const POST: APIRoute = async ({ request, redirect, cookies, url }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  let pagina = '/';
  const reply = (status: number, body: Record<string, unknown>) =>
    wantsJson
      ? Response.json(body, { status })
      : redirect(
          `${typeof body.pagina === 'string' ? body.pagina : pagina}?rsvp=${body.fechado ? 'fechado' : status < 400 ? 'ok' : 'erro'}#rsvp`,
          303,
        );

  if (rsvpFechado())
    return reply(410, { ok: false, fechado: true, error: 'As confirmações de presença já estão encerradas.' });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { ok: false, error: 'Pedido inválido.' });
  }

  // Campo-armadilha para bots: pessoas não o veem, por isso deve vir vazio.
  if (clean(form.get('website'), 200)) return reply(200, { ok: true });

  if (!(await permitir(`rsvp:${ipDe(request)}`, 12, 600)))
    return reply(429, { ok: false, error: 'Demasiadas respostas seguidas. Espera uns minutos e tenta de novo.' });

  // Resposta nova ou alteração.
  const edicao = clean(form.get('edicao'), 60);
  let existente: Rsvp | null = null;
  let maxAcomp = MAX_ACOMPANHANTES;
  if (edicao) {
    existente = /^[A-Za-z0-9_-]{16,60}$/.test(edicao) ? await findRsvpByEdicao(await sha256(edicao)) : null;
    if (!existente) return reply(404, { ok: false, error: 'Este link já não é válido. Envia uma resposta nova.', pagina: '/' });
    pagina = `/r/${edicao}`;
    maxAcomp = Math.max(MAX_ACOMPANHANTES, existente.acompanhantes);
  } else if (!(await temAcesso(cookies))) {
    return reply(403, { ok: false, semAcesso: true, error: 'Escreve primeiro o código que está no convite.' });
  }

  const nome = clean(form.get('nome'), 120);
  const presenca = clean(form.get('presenca'), 10);
  if (nome.length < 2) return reply(400, { ok: false, error: 'Escreve o teu nome, por favor.', campo: 'nome' });
  if (presenca !== 'sim' && presenca !== 'nao')
    return reply(400, { ok: false, error: 'Diz-nos se contamos contigo.', campo: 'presenca' });

  // Email opcional: recebe uma cópia da resposta e o link para a alterar.
  const email = limparEmail(form.get('email'));
  if (email === false) return reply(400, { ok: false, error: 'Esse email não parece certo.', campo: 'email' });

  const vai = presenca === 'sim';
  const pessoas: Pessoa[] = [];
  if (vai) {
    const n = Number(clean(form.get('acompanhantes'), 2) || '0');
    if (!Number.isInteger(n) || n < 0 || n > maxAcomp)
      return reply(400, { ok: false, error: 'Escolhe quantos acompanhantes trazes.', campo: 'acompanhantes' });

    for (let i = 0; i <= n; i++) {
      const nomePessoa = i === 0 ? nome : clean(form.get(`acomp_${i}_nome`), 120);
      if (nomePessoa.length < 2)
        return reply(400, { ok: false, error: `Escreve o nome do acompanhante ${i}, por favor.`, campo: `acomp_${i}_nome` });
      const idade = i === 0 ? IDADE_ADULTO : clean(form.get(`acomp_${i}_idade`), 10);
      if (!idadeValida(idade))
        return reply(400, { ok: false, error: `Diz-nos a idade de ${nomePessoa}, por favor.`, campo: `acomp_${i}_idade` });
      const r = interpretarRestricao(clean(form.get(`restricao_${i}`), 5), clean(form.get(`restricao_${i}_qual`), 300));
      if (r.restricao === null)
        return reply(400, {
          ok: false,
          error: i === 0 ? 'Diz-nos se tens alguma restrição alimentar.' : `Diz-nos se ${nomePessoa} tem alguma restrição alimentar.`,
          campo: `restricao_${i}`,
        });
      pessoas.push({ ordem: i, nome: nomePessoa, restricao: r.restricao, restricao_qual: r.qual, idade });
    }
  }
  const rsvp: RsvpInput = { nome, vai, pessoas, email };

  let id: number;
  let novoToken: string | null = null;
  try {
    if (existente) {
      id = existente.id;
      await updateRsvp(id, rsvp);
    } else {
      novoToken = tokenAleatorio();
      id = await insertRsvp(rsvp, { edicao_hash: await sha256(novoToken) });
      pagina = `/r/${novoToken}`;
    }
  } catch (err) {
    console.error('Erro a gravar RSVP', err);
    return reply(500, { ok: false, error: 'Não foi possível guardar a resposta. Tenta novamente.' });
  }

  // Os emails seguem em segundo plano: a resposta já está guardada, o convidado não espera por eles.
  const alterada = !!existente;
  const linkEdicao = novoToken ? `${url.origin}/r/${novoToken}` : edicao ? `${url.origin}/r/${edicao}` : null;
  waitUntil(
    Promise.all([
      sendRsvpEmail(rsvp, alterada ? 'alterada' : 'nova').then((sent) => (sent ? markEmailSent(id) : undefined)),
      email && linkEdicao
        ? enviarConfirmacao({ para: email, nome, vai, pessoas: pessoas.length, url: linkEdicao, alterada })
        : undefined,
    ]).catch((e) => console.error(e)),
  );

  return reply(200, { ok: true, vai, alterada, editar: linkEdicao ?? undefined, pagina });
};
