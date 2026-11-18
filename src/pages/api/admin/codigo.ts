import type { APIRoute } from 'astro';
import { normalizarCodigo } from '../../../lib/acesso';
import { gravarConfig } from '../../../lib/seguranca';

export const prerender = false;

// Protegido pelo middleware (/api/admin/*): só com sessão do dashboard e pedidos deste site.
export const POST: APIRoute = async ({ request, redirect }) => {
  const f = await request.formData();
  if (f.get('remover')) {
    await gravarConfig('codigo', null);
    return redirect('/dashboard?codigo=removido#codigo', 303);
  }
  const codigo = normalizarCodigo(f.get('codigo'));
  if (codigo.length < 4 || codigo.length > 24) return redirect('/dashboard?codigo=invalido#codigo', 303);
  await gravarConfig('codigo', codigo);
  return redirect('/dashboard?codigo=guardado#codigo', 303);
};
