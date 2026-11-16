import type { APIRoute } from 'astro';
import { listRsvps } from '../../lib/db';
import { idadeLabel } from '../../lib/rsvp';

export const prerender = false;

// Protegido pelo middleware (está dentro de /dashboard).
export const GET: APIRoute = async () => {
  const rows = await listRsvps();
  const cell = (v: string | number) => {
    let s = String(v);
    // Evita que o Excel interprete o conteúdo como fórmula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  // Uma linha por pessoa: dá para filtrar no Excel por restrições ou contar lugares.
  const header = ['Data', 'Resposta de', 'Vai', 'Pessoa', 'Tipo', 'Idade', 'Restrição alimentar', 'Qual'];
  const lines = rows
    .slice()
    .reverse()
    .flatMap((r) =>
      r.vai && r.pessoas.length
        ? r.pessoas.map((p) => [
            r.criado_em,
            r.nome,
            'Sim',
            p.nome,
            p.ordem === 0 ? 'Convidado' : `Acompanhante ${p.ordem}`,
            p.idade ? idadeLabel(p.idade) : '',
            p.restricao === 1 ? 'Sim' : p.restricao === 0 ? 'Não' : '',
            p.restricao_qual,
          ])
        : [[r.criado_em, r.nome, 'Não', r.nome, 'Convidado', '', '', '']],
    )
    .map((cols) => cols.map(cell).join(';'));
  // BOM + ";" para abrir bem no Excel em português.
  const csv = '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rsvp-aminah-luis-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
