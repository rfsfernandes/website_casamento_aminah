// Código de acesso impresso no convite.
//
// Sem código definido no dashboard, o site fica aberto a quem tiver o link (como antes).
// Com código, quem abre o link vê só a capa e um campo para o código; o código certo deixa um
// cookie assinado durante 60 dias. A assinatura inclui o código: mudar o código fecha a porta a
// quem entrou com o antigo. Os links pessoais (/c/<id>) não precisam de código.
import type { AstroCookies } from 'astro';
import { chaveCookies, hmac, lerConfig, safeEqual } from './seguranca';

export const COOKIE_ACESSO = 'convite_acesso';
const DIAS = 60;

/** "serra-lheira 27" → "SERRALHEIRA27". Os convidados podem escrever com ou sem espaços e em minúsculas. */
export const normalizarCodigo = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);

export const lerCodigo = () => lerConfig('codigo');

async function assinatura(exp: string, codigo: string) {
  return hmac(await chaveCookies(), `acesso.${exp}.${codigo}`);
}

export async function codigoCerto(tentativa: string): Promise<boolean> {
  const codigo = await lerCodigo();
  if (!codigo) return false;
  // Compara os HMACs (comprimento fixo) para não revelar nada pelo tempo de resposta.
  const chave = await chaveCookies();
  const [a, b] = await Promise.all([hmac(chave, `c.${normalizarCodigo(tentativa)}`), hmac(chave, `c.${codigo}`)]);
  return safeEqual(a, b);
}

export async function darAcesso(cookies: AstroCookies, url: URL): Promise<void> {
  const codigo = await lerCodigo();
  if (!codigo) return;
  const maxAge = DIAS * 86_400;
  const exp = String(Math.floor(Date.now() / 1000) + maxAge);
  cookies.set(COOKIE_ACESSO, `${exp}.${await assinatura(exp, codigo)}`, {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

/** true se o site está aberto (sem código) ou se este browser já escreveu o código certo. */
export async function temAcesso(cookies: AstroCookies): Promise<boolean> {
  const codigo = await lerCodigo();
  if (!codigo) return true;
  const [exp, sig] = (cookies.get(COOKIE_ACESSO)?.value ?? '').split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await assinatura(exp, codigo));
}
