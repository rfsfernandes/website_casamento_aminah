import { env } from 'cloudflare:workers';
import { textoRestricao, type RsvpInput } from './db';
import { idadeLabel } from './rsvp';

type MailEnv = Env & { RESEND_API_KEY?: string; RSVP_TO_EMAIL?: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Envia a resposta por email via Resend. Devolve false (sem lançar) se falhar ou não estiver configurado. */
export async function sendRsvpEmail(r: RsvpInput): Promise<boolean> {
  const e = env as MailEnv;
  if (!e.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não definida: email não enviado.');
    return false;
  }
  if (!e.RSVP_TO_EMAIL) {
    console.warn('RSVP_TO_EMAIL não definido: email não enviado.');
    return false;
  }
  const estado = r.vai ? 'Vai ✅' : 'Não vai ❌';
  const linhas: [string, string][] = [
    ['Nome', r.nome],
    ['Presença', r.vai ? 'Claro que sim!!!' : 'Infelizmente não vou.'],
  ];
  if (r.vai) {
    const acomp = r.pessoas.slice(1);
    linhas.push(['Restrição alimentar', textoRestricao(r.pessoas[0])]);
    linhas.push(['Acompanhantes', acomp.length ? String(acomp.length) : 'Nenhum']);
    acomp.forEach((p) =>
      linhas.push([`Acompanhante ${p.ordem}`, `${p.nome} · ${idadeLabel(p.idade)} · Restrição: ${textoRestricao(p)}`]),
    );
    linhas.push(['Total de pessoas', String(r.pessoas.length)]);
  }
  const html = `
    <div style="font-family:Georgia,serif;color:#3e513c;max-width:520px">
      <h2 style="margin:0 0 12px">Nova resposta ao RSVP</h2>
      <table cellpadding="8" style="border-collapse:collapse;width:100%">
        ${linhas
          .map(
            ([k, v]) =>
              `<tr><td style="border-bottom:1px solid #e5dccb;font-weight:bold;width:40%">${esc(k)}</td><td style="border-bottom:1px solid #e5dccb">${esc(v)}</td></tr>`,
          )
          .join('')}
      </table>
    </div>`;
  const text = linhas.map(([k, v]) => `${k}: ${v}`).join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: e.RSVP_FROM_EMAIL,
        to: [e.RSVP_TO_EMAIL],
        subject: `RSVP: ${r.nome} — ${estado}${r.vai && r.pessoas.length > 1 ? ` (${r.pessoas.length} pessoas)` : ''}`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error('Resend falhou', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend erro', err);
    return false;
  }
}
