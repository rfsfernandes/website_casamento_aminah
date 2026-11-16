import type { APIRoute } from 'astro';
import { waitUntil } from 'cloudflare:workers';
import { insertRsvp, markEmailSent, type Pessoa, type RsvpInput } from '../../lib/db';
import { IDADE_ADULTO, MAX_ACOMPANHANTES, idadeValida, interpretarRestricao, rsvpFechado } from '../../lib/rsvp';
import { sendRsvpEmail } from '../../lib/email';

export const prerender = false;

const clean = (v: FormDataEntryValue | null, max: number) =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);

export const POST: APIRoute = async ({ request, redirect }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const reply = (status: number, body: Record<string, unknown>) =>
    wantsJson
      ? Response.json(body, { status })
      : redirect(body.fechado ? '/?rsvp=fechado#rsvp' : status < 400 ? '/?rsvp=ok#rsvp' : '/?rsvp=erro#rsvp', 303);

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

  const nome = clean(form.get('nome'), 120);
  const presenca = clean(form.get('presenca'), 10);
  if (nome.length < 2) return reply(400, { ok: false, error: 'Escreve o teu nome, por favor.', campo: 'nome' });
  if (presenca !== 'sim' && presenca !== 'nao')
    return reply(400, { ok: false, error: 'Diz-nos se contamos contigo.', campo: 'presenca' });

  const vai = presenca === 'sim';
  const pessoas: Pessoa[] = [];
  if (vai) {
    const n = Number(clean(form.get('acompanhantes'), 2) || '0');
    if (!Number.isInteger(n) || n < 0 || n > MAX_ACOMPANHANTES)
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
  const rsvp: RsvpInput = { nome, vai, pessoas };

  let id: number;
  try {
    id = await insertRsvp(rsvp);
  } catch (err) {
    console.error('Erro a gravar RSVP', err);
    return reply(500, { ok: false, error: 'Não foi possível guardar a resposta. Tenta novamente.' });
  }

  // O email segue em segundo plano: a resposta já está guardada, o convidado não espera por ele.
  waitUntil(
    sendRsvpEmail(rsvp).then((sent) => (sent ? markEmailSent(id) : undefined)).catch((e) => console.error(e)),
  );

  return reply(200, { ok: true, vai });
};
