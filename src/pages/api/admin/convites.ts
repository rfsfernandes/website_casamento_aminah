import type { APIRoute } from 'astro';
import {
  MAX_LUGARES,
  MAX_MENSAGEM,
  apagarConvite,
  ativarConvite,
  criarConvites,
  editarConvite,
  lerConvite,
  lerMensagem,
  limparEmail,
  limparTelefone,
  listarConvites,
  marcarEmails,
  marcarWhatsapp,
  urlConvite,
} from '../../../lib/convites';
import { enviarConvites, LIMITE_EMAILS_DIA } from '../../../lib/email';
import { normalizarCodigo } from '../../../lib/acesso';
import { db, gravarConfig } from '../../../lib/seguranca';

export const prerender = false;

const MAX_CONVITES = 400;
const texto = (v: FormDataEntryValue | null, max: number) =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Valida uma linha (nome, lugares, email, telefone). Devolve o erro em texto, ou os valores limpos. */
function linha(nomeV: unknown, lugaresV: unknown, emailV: unknown, telV: unknown) {
  const nome = String(nomeV ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const lugares = Number(lugaresV);
  const email = limparEmail(emailV);
  const telefone = limparTelefone(telV);
  if (nome.length < 2) return { erro: 'Falta o nome de um dos convites.' };
  if (!Number.isInteger(lugares) || lugares < 1 || lugares > MAX_LUGARES)
    return { erro: `"${nome}": os lugares vão de 1 a ${MAX_LUGARES}.` };
  if (email === false) return { erro: `"${nome}": o email não parece certo.` };
  if (telefone === false) return { erro: `"${nome}": o telefone não parece certo.` };
  return { valor: { nome, lugares, email, telefone } };
}

// Protegido pelo middleware (/api/admin/*): só com sessão do dashboard e pedidos deste site.
export const POST: APIRoute = async ({ request, redirect, url }) => {
  const f = await request.formData();
  const acao = texto(f.get('acao'), 30);
  const id = texto(f.get('id'), 60);
  const voltar = (tipo: 'ok' | 'erro', msg: string, ancora = '') =>
    redirect(`/dashboard/convidados?${tipo}=${encodeURIComponent(msg)}${ancora}`, 303);

  switch (acao) {
    case 'adicionar': {
      const nomes = f.getAll('nome');
      const linhas = [];
      for (let i = 0; i < Math.min(nomes.length, 100); i++) {
        const vazia = !String(nomes[i] ?? '').trim() && !String(f.getAll('email')[i] ?? '').trim() && !String(f.getAll('telefone')[i] ?? '').trim();
        if (vazia) continue;
        const l = linha(nomes[i], f.getAll('lugares')[i], f.getAll('email')[i], f.getAll('telefone')[i]);
        if (l.erro) return voltar('erro', `${l.erro} Nada foi adicionado.`, '#adicionar');
        linhas.push(l.valor!);
      }
      if (!linhas.length) return voltar('erro', 'Escreve pelo menos um nome.', '#adicionar');
      const r = await db().prepare('SELECT COUNT(*) AS n FROM convites').first<{ n: number }>();
      if ((r?.n ?? 0) + linhas.length > MAX_CONVITES)
        return voltar('erro', `O limite é de ${MAX_CONVITES} convites.`, '#adicionar');
      const n = await criarConvites(linhas);
      return voltar('ok', n === 1 ? 'Convite adicionado.' : `${n} convites adicionados.`, '#lista');
    }

    case 'editar': {
      if (!(await lerConvite(id))) return voltar('erro', 'Esse convite já não existe.');
      const l = linha(f.get('nome'), f.get('lugares'), f.get('email'), f.get('telefone'));
      if (l.erro) return voltar('erro', l.erro, '#lista');
      await editarConvite(id, l.valor!);
      return voltar('ok', 'Convite atualizado.', '#lista');
    }

    case 'desativar':
    case 'ativar':
      await ativarConvite(id, acao === 'ativar');
      return voltar('ok', acao === 'ativar' ? 'Link ativado outra vez.' : 'Link desativado: deixa de abrir o convite.', '#lista');

    case 'apagar':
      await apagarConvite(id);
      return voltar('ok', 'Convite apagado. Se já tinha resposta, a resposta continua nas Respostas.', '#lista');

    case 'whatsapp':
      // Chamado em segundo plano quando se carrega em "WhatsApp" (não dá para saber se a mensagem foi mesmo enviada).
      await marcarWhatsapp(id);
      return new Response(null, { status: 204 });

    case 'enviar-email': {
      const todos = await listarConvites();
      const alvo = todos.filter(
        (c) => c.email && !c.desativado_em && (id ? c.id === id : !c.email_enviado_em),
      );
      if (!alvo.length) return voltar('erro', 'Não há emails por enviar.', '#lista');
      const { texto: mensagem } = await lerMensagem();
      try {
        const r = await enviarConvites(
          alvo.map((c) => ({ id: c.id, nome: c.nome, lugares: c.lugares, email: c.email!, url: urlConvite(url.origin, c.id) })),
          mensagem,
        );
        await marcarEmails(r.enviados);
        if (!r.enviados.length)
          return voltar('erro', `Chegou-se ao limite de ${LIMITE_EMAILS_DIA} emails por dia. Os restantes podem ser enviados amanhã.`, '#lista');
        const n = r.enviados.length;
        let msg = n === 1 ? 'Email enviado.' : `${n} emails enviados.`;
        if (r.simulado) msg = `${msg.replace('.', '')} (simulado: falta a RESEND_API_KEY, nada saiu).`;
        if (r.ficaram) msg += ` ${r.ficaram} ficaram para amanhã (limite de ${LIMITE_EMAILS_DIA} por dia).`;
        return voltar('ok', msg, '#lista');
      } catch (err) {
        return voltar('erro', err instanceof Error ? err.message : 'Não foi possível enviar.', '#lista');
      }
    }

    case 'codigo': {
      if (f.get('remover')) {
        await gravarConfig('codigo', null);
        return voltar('ok', 'Código removido: o convite está aberto a quem tiver o link.', '#codigo');
      }
      const codigo = normalizarCodigo(f.get('codigo'));
      if (codigo.length < 4 || codigo.length > 24)
        return voltar('erro', 'O código tem de ter entre 4 e 24 letras ou números.', '#codigo');
      await gravarConfig('codigo', codigo);
      return voltar('ok', `Código guardado: ${codigo}.`, '#codigo');
    }

    case 'mensagem': {
      const m = String(f.get('mensagem') ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, MAX_MENSAGEM);
      await gravarConfig('mensagem', f.get('repor') || !m ? null : m);
      return voltar('ok', f.get('repor') || !m ? 'Mensagem reposta.' : 'Mensagem guardada.', '#mensagem');
    }
  }
  return voltar('erro', 'Ação desconhecida.');
};
