import { env } from 'cloudflare:workers';
import { textoRestricao, type RsvpInput } from './db';
import { idadeLabel } from './rsvp';
import { devolver, reservar } from './seguranca';

type MailEnv = Env & { RESEND_API_KEY?: string; RSVP_TO_EMAIL?: string };
const e = () => env as MailEnv;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface Mail {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

/**
 * Cópias das respostas enviadas a convidados, por dia. O plano gratuito do Resend dá 100 por dia;
 * ficam 20 de margem para os emails de cada resposta que chegam aos noivos.
 */
export const LIMITE_EMAILS_DIA = 80;
const CHAVE_QUOTA = 'emails-convidados';
const DIA = 86_400;

const resendConfigurado = () => !!e().RESEND_API_KEY;

/** Envia um ou vários emails (lote). Devolve false (sem lançar) se falhar ou não estiver configurado. */
async function enviar(mails: Mail[]): Promise<boolean> {
  if (!mails.length) return true;
  if (!e().RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não definida: email não enviado.');
    return false;
  }
  const corpo = mails.map((m) => ({ from: e().RSVP_FROM_EMAIL, ...m }));
  try {
    const res = await fetch(mails.length > 1 ? 'https://api.resend.com/emails/batch' : 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${e().RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mails.length > 1 ? corpo : corpo[0]),
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

/** Email com o mesmo aspeto do site: título, parágrafos e, se houver, um botão. */
function moldura(o: { titulo: string; paragrafos: string[]; botao?: { texto: string; url: string }; rodape?: string }) {
  const html = `
    <div style="font-family:Georgia,serif;color:#3e513c;max-width:520px;margin:0 auto;padding:8px">
      <p style="letter-spacing:.12em;text-transform:uppercase;font-size:13px;color:#99967c;margin:0 0 6px">Aminah &amp; Luís · 05.09.2027</p>
      <h2 style="font-weight:normal;font-size:26px;margin:0 0 16px">${esc(o.titulo)}</h2>
      ${o.paragrafos.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
      ${
        o.botao
          ? `<p style="margin:24px 0"><a href="${esc(o.botao.url)}" style="display:inline-block;background:#3e513c;color:#f3dbb9;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:16px">${esc(o.botao.texto)}</a></p>
             <p style="font-size:13px;color:#99967c;margin:0 0 14px">Ou copia este endereço: ${esc(o.botao.url)}</p>`
          : ''
      }
      ${o.rodape ? `<p style="font-size:13px;color:#99967c;margin:24px 0 0">${esc(o.rodape)}</p>` : ''}
    </div>`;
  const text = [o.titulo, ...o.paragrafos, o.botao ? `${o.botao.texto}: ${o.botao.url}` : '', o.rodape ?? '']
    .filter(Boolean)
    .join('\n\n');
  return { html, text };
}

export type TipoResposta = 'nova' | 'alterada' | 'apagada';

/** Avisa os noivos de uma resposta nova, alterada ou apagada. */
export async function sendRsvpEmail(r: RsvpInput, tipo: TipoResposta = 'nova'): Promise<boolean> {
  if (!e().RSVP_TO_EMAIL) {
    console.warn('RSVP_TO_EMAIL não definido: email não enviado.');
    return false;
  }
  const estado = tipo === 'apagada' ? 'Resposta apagada' : r.vai ? 'Vai ✅' : 'Não vai ❌';
  const linhas: [string, string][] = [['Nome', r.nome]];
  if (tipo !== 'apagada') linhas.push(['Presença', r.vai ? 'Claro que sim!!!' : 'Infelizmente não vou.']);
  if (tipo !== 'apagada' && r.vai) {
    const acomp = r.pessoas.slice(1);
    linhas.push(['Restrição alimentar', textoRestricao(r.pessoas[0])]);
    linhas.push(['Acompanhantes', acomp.length ? String(acomp.length) : 'Nenhum']);
    acomp.forEach((p) =>
      linhas.push([`Acompanhante ${p.ordem}`, `${p.nome} · ${idadeLabel(p.idade)} · Restrição: ${textoRestricao(p)}`]),
    );
    linhas.push(['Total de pessoas', String(r.pessoas.length)]);
  }
  const titulo = { nova: 'Nova resposta ao RSVP', alterada: 'Resposta alterada', apagada: 'Resposta apagada pelo convidado' }[tipo];
  const html = `
    <div style="font-family:Georgia,serif;color:#3e513c;max-width:520px">
      <h2 style="margin:0 0 12px">${titulo}</h2>
      <table cellpadding="8" style="border-collapse:collapse;width:100%">
        ${linhas
          .map(
            ([k, v]) =>
              `<tr><td style="border-bottom:1px solid #e5dccb;font-weight:bold;width:40%">${esc(k)}</td><td style="border-bottom:1px solid #e5dccb">${esc(v)}</td></tr>`,
          )
          .join('')}
      </table>
    </div>`;
  const text = [titulo, ...linhas.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const prefixo = { nova: 'RSVP', alterada: 'RSVP alterado', apagada: 'RSVP apagado' }[tipo];
  const grupo = tipo !== 'apagada' && r.vai && r.pessoas.length > 1 ? ` (${r.pessoas.length} pessoas)` : '';
  return enviar([{ to: [e().RSVP_TO_EMAIL!], subject: `${prefixo}: ${r.nome} — ${estado}${grupo}`, html, text }]);
}

/** Cópia da resposta para o convidado que deu o email, com o link para a alterar. */
export async function enviarConfirmacao(o: { para: string; nome: string; vai: boolean; pessoas: number; url: string; alterada: boolean }) {
  if (!resendConfigurado()) return false;
  if (!(await reservar(CHAVE_QUOTA, LIMITE_EMAILS_DIA, DIA, 1))) return false;
  const primeiro = o.nome.split(' ')[0];
  const m = moldura({
    titulo: o.alterada ? `Resposta alterada, ${primeiro}` : `Obrigado, ${primeiro}!`,
    paragrafos: [
      o.vai
        ? o.pessoas > 1
          ? `Contamos convosco: ${o.pessoas} pessoas. Mal podemos esperar por celebrar juntos.`
          : 'Mal podemos esperar por celebrar contigo.'
        : 'Obrigado por nos avisares. Vamos sentir a tua falta!',
      'Se precisares de mudar alguma coisa, usa o botão abaixo até 15 de julho de 2027.',
    ],
    botao: { texto: 'Ver ou alterar a resposta', url: o.url },
    rodape: 'Este link é só teu: quem o tiver pode alterar a tua resposta.',
  });
  const ok = await enviar([{ to: [o.para], subject: 'A tua resposta ao convite da Aminah e do Luís', ...m }]);
  if (!ok) await devolver(CHAVE_QUOTA, 1);
  return ok;
}
