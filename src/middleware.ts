import { defineMiddleware } from 'astro:middleware';
import { COOKIE_NAME, isValidSession } from './lib/auth';

// Protege o dashboard e as rotas de administração.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  const isDashboard = path === '/dashboard' || (path.startsWith('/dashboard/') && path !== '/dashboard/login');
  const isAdminApi = path.startsWith('/api/admin/');
  if (!isDashboard && !isAdminApi) return next();

  if (await isValidSession(ctx.cookies.get(COOKIE_NAME)?.value)) {
    const res = await next();
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  }
  if (isAdminApi) return new Response('Não autorizado', { status: 401 });
  return ctx.redirect('/dashboard/login', 303);
});
