import type { APIRoute } from 'astro';
import { waitUntil } from 'cloudflare:workers';
import { deleteRsvp, findRsvpByEdicao } from '../../lib/db';
import { rsvpFechado } from '../../lib/rsvp';
import { sendRsvpEmail } from '../../lib/email';
import { sha256 } from '../../lib/seguranca';

export const prerender = false;

/** O convidado apaga a própria resposta, a partir do link de alteração (/r/<token>). */
export const POST: APIRoute = async ({ request, redirect }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const form = await request.formData().catch(() => new FormData());
  const edicao = String(form.get('edicao') ?? '');
  const reply = (status: number, body: Record<string, unknown>) =>
    wantsJson ? Response.json(body, { status }) : redirect(`/?rsvp=${status < 400 ? 'apagada' : 'erro'}#rsvp`, 303);

  if (rsvpFechado()) return reply(410, { ok: false, fechado: true, error: 'As confirmações já estão encerradas.' });

  const rsvp = /^[A-Za-z0-9_-]{16,60}$/.test(edicao) ? await findRsvpByEdicao(await sha256(edicao)) : null;
  if (!rsvp) return reply(404, { ok: false, error: 'Não encontrámos essa resposta.' });

  await deleteRsvp(rsvp.id);
  waitUntil(sendRsvpEmail({ nome: rsvp.nome, vai: !!rsvp.vai, pessoas: rsvp.pessoas }, 'apagada').catch((e) => console.error(e)));
  return reply(200, { ok: true });
};
