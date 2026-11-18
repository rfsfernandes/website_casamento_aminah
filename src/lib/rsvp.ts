// Regras do formulário de RSVP, partilhadas entre a página, a API e o dashboard.

/**
 * Fim das confirmações: 16 de julho de 2027, 00:00 em Lisboa (UTC+1 no verão).
 * O dia 15 de julho conta todo. A partir daqui o formulário desaparece e a API recusa respostas.
 */
export const RSVP_FECHA_EM = '2027-07-15T23:00:00Z';

export const rsvpFechado = (agora = Date.now()) => agora >= Date.parse(RSVP_FECHA_EM);

/**
 * Escalões de idade dos acompanhantes (o preço por pessoa depende disto).
 * `id` é o que fica gravado: pode-se mudar o texto (`label`) sem estragar respostas antigas.
 * Quando houver preços, juntar aqui um `preco` por escalão para o dashboard calcular o total.
 */
export const IDADES = [
  { id: 'ate4', label: 'Até 4 anos', curto: 'até 4 anos' },
  { id: '5a9', label: '5 a 9 anos', curto: '5–9 anos' },
  { id: '10mais', label: '10 ou mais anos', curto: '10+ anos' },
] as const;

export type Idade = (typeof IDADES)[number]['id'];

/** Quem preenche o formulário é adulto. */
export const IDADE_ADULTO: Idade = '10mais';

export const idadeValida = (v: string): v is Idade => IDADES.some((i) => i.id === v);
export const idadeLabel = (id: string | null) => IDADES.find((i) => i.id === id)?.label ?? 'Idade não indicada';
export const idadeCurta = (id: string | null) => IDADES.find((i) => i.id === id)?.curto ?? '?';

/** Número máximo de acompanhantes por resposta. */
export const MAX_ACOMPANHANTES = 6;

// "não", "nenhuma", "-", "n/a"... contam como resposta "não".
const NAO = /^\s*(n[aã]o(\b.*)?|no|n|nenhum[ao]?s?(\b.*)?|nada|ningu[eé]m|sem restri[cç](ao|ão|oes|ões)|-+|\.+|x|0|n\/a)\s*[.!]*\s*$/i;
// "sim" sozinho é um "sim" sem detalhe.
const SIM = /^\s*(sim|s|yes|y|tenho)\s*[.!]*\s*$/i;

export interface Restricao {
  /** 1 = tem, 0 = não tem, null = não respondeu */
  restricao: 0 | 1 | null;
  qual: string;
}

/**
 * Junta a escolha (sim/não) com o texto escrito.
 * Se a pessoa escrever uma restrição, conta como "sim" (mesmo sem escolher a opção).
 */
export function interpretarRestricao(escolha: string, texto: string): Restricao {
  const t = texto.trim();
  if (t && SIM.test(t)) return { restricao: 1, qual: '' };
  if (t && NAO.test(t)) return { restricao: 0, qual: '' };
  if (t) return { restricao: 1, qual: t };
  if (escolha === 'sim') return { restricao: 1, qual: '' };
  if (escolha === 'nao') return { restricao: 0, qual: '' };
  return { restricao: null, qual: '' };
}

/** Email opcional de quem responde: null se vazio, false se não parecer um email. */
export function limparEmail(v: unknown): string | null | false {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  return s.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) ? s : false;
}
