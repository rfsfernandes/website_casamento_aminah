// Peças pequenas de segurança: tokens aleatórios, hashes, HMAC, definições e limites de tentativas.
import { env } from 'cloudflare:workers';

const enc = new TextEncoder();
export const db = () => (env as Env).DB;

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  let s = '';
  for (const x of new Uint8Array(bytes)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Token aleatório para links (16 bytes = 22 caracteres; impossível de adivinhar). */
export function tokenAleatorio(bytes = 16): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64url(b);
}

export async function sha256(texto: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(texto));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function hmac(chave: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

/** Compara sem sair mais cedo (não revela nada pelo tempo de resposta). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const agoraIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/* ---------- definições (tabela config) ---------- */

export async function lerConfig(chave: string): Promise<string | null> {
  const r = await db().prepare('SELECT valor FROM config WHERE chave = ?1').bind(chave).first<{ valor: string }>();
  return r?.valor ?? null;
}

export async function gravarConfig(chave: string, valor: string | null): Promise<void> {
  if (valor === null) await db().prepare('DELETE FROM config WHERE chave = ?1').bind(chave).run();
  else
    await db()
      .prepare('INSERT INTO config (chave, valor) VALUES (?1, ?2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor')
      .bind(chave, valor)
      .run();
}

/** Chave para assinar os cookies dos convidados. Criada na primeira vez e guardada na base de dados. */
export async function chaveCookies(): Promise<string> {
  const atual = await lerConfig('chave_cookies');
  if (atual) return atual;
  await db().prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?1, ?2)').bind('chave_cookies', tokenAleatorio(32)).run();
  return (await lerConfig('chave_cookies'))!;
}

/* ---------- limites de tentativas (tabela limites) ---------- */

/** Janela fixa: devolve false quando já se chegou ao limite nesta janela. */
export async function permitir(chave: string, limite: number, segundos: number): Promise<boolean> {
  const agora = Date.now();
  const inicio = new Date(agora - (agora % (segundos * 1000))).toISOString();
  const r = await db()
    .prepare(
      `INSERT INTO limites (chave, inicio, n) VALUES (?1, ?2, 1)
       ON CONFLICT (chave) DO UPDATE SET
         n = CASE WHEN limites.inicio = excluded.inicio THEN limites.n + 1 ELSE 1 END,
         inicio = excluded.inicio
       RETURNING n`,
    )
    .bind(chave, inicio)
    .first<{ n: number }>();
  return (r?.n ?? 1) <= limite;
}

/** Reserva até `n` unidades de uma quota (ex.: emails por dia). Devolve quantas ficaram reservadas. */
export async function reservar(chave: string, limite: number, segundos: number, n: number): Promise<number> {
  const agora = Date.now();
  const inicio = new Date(agora - (agora % (segundos * 1000))).toISOString();
  const r = await db()
    .prepare(
      `INSERT INTO limites (chave, inicio, n) VALUES (?1, ?2, 0)
       ON CONFLICT (chave) DO UPDATE SET
         n = CASE WHEN limites.inicio = excluded.inicio THEN limites.n ELSE 0 END,
         inicio = excluded.inicio
       RETURNING n`,
    )
    .bind(chave, inicio)
    .first<{ n: number }>();
  const dado = Math.max(0, Math.min(n, limite - (r?.n ?? 0)));
  if (dado) await db().prepare('UPDATE limites SET n = n + ?2 WHERE chave = ?1').bind(chave, dado).run();
  return dado;
}

export async function devolver(chave: string, n: number): Promise<void> {
  if (n > 0) await db().prepare('UPDATE limites SET n = MAX(0, n - ?2) WHERE chave = ?1').bind(chave, n).run();
}

/** IP de quem faz o pedido (na Cloudflare); em local fica "local". */
export const ipDe = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'local';
