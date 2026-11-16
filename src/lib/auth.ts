// Sessão do dashboard: cookie assinado com HMAC usando a própria DASHBOARD_PASSWORD
// como chave. Mudar a palavra-passe termina todas as sessões abertas.
import { env } from 'cloudflare:workers';

export const COOKIE_NAME = 'dash_session';
const SESSION_DAYS = 30;
const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function password(): string {
  const p = (env as Env & { DASHBOARD_PASSWORD?: string }).DASHBOARD_PASSWORD;
  return typeof p === 'string' ? p : '';
}

export function isConfigured(): boolean {
  return password().length >= 8;
}

export async function checkPassword(input: string): Promise<boolean> {
  const p = password();
  if (!p || p.length < 8) return false;
  // Compara os HMACs (comprimento fixo) para não revelar nada pelo tempo de resposta.
  const [a, b] = await Promise.all([hmac('pw-check', input), hmac('pw-check', p)]);
  return safeEqual(a, b);
}

export async function createSessionCookie(): Promise<{ value: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const exp = String(Math.floor(Date.now() / 1000) + maxAge);
  return { value: `${exp}.${await hmac(password(), exp)}`, maxAge };
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  if (!cookie || !isConfigured()) return false;
  const [exp, sig] = cookie.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(password(), exp));
}
