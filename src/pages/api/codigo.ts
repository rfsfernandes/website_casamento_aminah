import type { APIRoute } from 'astro';
import { codigoCerto, darAcesso } from '../../lib/acesso';
import { ipDe, permitir } from '../../lib/seguranca';

export const prerender = false;

/** Código do convite impresso: certo → cookie de acesso e volta ao convite; errado → volta com aviso. */
export const POST: APIRoute = async ({ request, redirect, cookies, url }) => {
  const form = await request.formData().catch(() => new FormData());
  if (!(await permitir(`codigo:${ipDe(request)}`, 8, 60))) return redirect('/?codigo=espera#codigo', 303);
  if (!(await codigoCerto(String(form.get('codigo') ?? '')))) return redirect('/?codigo=errado#codigo', 303);
  await darAcesso(cookies, url);
  return redirect('/', 303);
};
