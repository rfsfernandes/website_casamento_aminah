import { defineMiddleware } from 'astro:middleware';
import { COOKIE_NAME, isValidSession } from './lib/auth';

/** Pedidos que mudam dados só podem vir deste site (proteção contra CSRF). */
function mesmoSite(req: Request, url: URL): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.get('Origin');
  if (origin && origin !== 'null') return origin === url.origin;
  // Sem Origin (ou "null", por causa da política de referrer): o browser diz se veio deste site.
  return req.headers.get('Sec-Fetch-Site') === 'same-origin';
}

// Protege o dashboard e as rotas de administração, e junta cabeçalhos de segurança a todas as páginas.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  if (!mesmoSite(ctx.request, ctx.url)) return new Response('Pedido recusado', { status: 403 });

  const isDashboard = path === '/dashboard' || (path.startsWith('/dashboard/') && path !== '/dashboard/login');
  const isAdminApi = path.startsWith('/api/admin/');

  if (isDashboard || isAdminApi) {
    if (!(await isValidSession(ctx.cookies.get(COOKIE_NAME)?.value))) {
      if (isAdminApi) return new Response('Não autorizado', { status: 401 });
      return ctx.redirect('/dashboard/login', 303);
    }
  }

  const res = await next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  if (!res.headers.has('Referrer-Policy')) res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isDashboard || isAdminApi || path.startsWith('/c/') || path.startsWith('/r/')) {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
  }
  return res;
});
