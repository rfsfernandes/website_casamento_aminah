import type { APIRoute } from 'astro';
import { deleteRsvp } from '../../../lib/db';

export const prerender = false;

// Protegido pelo middleware (/api/admin/*). Usado para remover respostas duplicadas ou de teste.
export const POST: APIRoute = async ({ request, redirect }) => {
  const data = await request.formData();
  const id = Number(data.get('id'));
  if (!Number.isInteger(id) || id <= 0) return new Response('ID inválido', { status: 400 });
  await deleteRsvp(id);
  return redirect('/dashboard?apagado=1', 303);
};
