# Casamento Aminah & Luís

Site do convite (5 de setembro de 2027, Quinta da Serralheira), com RSVP e um dashboard privado com as respostas.

- **Site:** Astro 7, a partir do design do Canva ("Convite aminah"). O convite é servido pelo Worker (já não é uma página estática) para só aparecer a quem tem o código. O design está em `src/components/Convite.astro`.
- **RSVP:** `POST /api/rsvp` grava na base de dados D1 e envia um email (Resend) aos noivos (endereço no segredo `RSVP_TO_EMAIL`).
- **Formulário:** quem vai escolhe quantos acompanhantes leva (0 a 6, `MAX_ACOMPANHANTES` em `src/lib/rsvp.ts`), escreve o nome de cada um indica a idade de cada um (Até 4 anos / 5 a 9 anos / 10 ou mais anos, em `IDADES` no mesmo ficheiro; quem preenche conta como adulto) e responde, para cada pessoa, se tem restrições alimentares (Não / Sim + qual). Escrever a restrição sem escolher conta como "Sim"; escrever só "sim" ou "não" conta como essa resposta.
- **Prazo:** a 16 de julho de 2027 (00:00, Lisboa) o formulário dá lugar a uma mensagem de "confirmações encerradas" e a API deixa de aceitar respostas (e alterações). Para mudar a data, altera `RSVP_FECHA_EM` em `src/lib/rsvp.ts` (e o texto do prazo em `src/components/Convite.astro`) e publica.
- **Dashboard:** `/dashboard`, protegido por palavra-passe. Mostra totais (pessoas confirmadas, vão/não vão, acompanhantes), idades das pessoas confirmadas, restrições alimentares por pessoa (com/sem, quem disse "sim" sem especificar), respostas por dia, tabela com pesquisa (também por nome de acompanhante), exportação CSV com uma linha por pessoa e opção de apagar respostas duplicadas ou de teste.
- **Alojamento:** Cloudflare Workers (plano gratuito).

## Acesso ao convite: link (QR code) + código

Quem abre o site vê só a capa e um campo para o código impresso no convite. O código certo deixa um cookie durante 60 dias.

- O código define-se no dashboard (`/dashboard`, painel "Código do convite"): letras e números, de 4 a 24; maiúsculas, espaços e acentos não contam.
- **Sem código definido, o site fica aberto a quem tiver o link, como antes.**
- Mudar o código fecha a porta a quem entrou com o antigo: define-o antes de imprimir e não o mudes depois.
- `/?c=CODIGO` entra direto (para um QR code que já leve o código, se preferirem).

## Alterar ou apagar a resposta

- Depois de responder, o convidado recebe um link só seu (`/r/<token>`), mostrado no fim e enviado por email se escrever o email (opcional). Na base de dados só fica o hash do link.
- O link abre o convite com a resposta preenchida, com "Guardar alterações" e "Apagar a minha resposta" (até ao prazo).
- Cada alteração ou remoção envia email aos noivos ("RSVP alterado", "RSVP apagado"). No dashboard, as respostas alteradas têm a etiqueta "alterada".
- Cópias para convidados: no máximo 80 por dia, para caber no plano gratuito do Resend (100/dia) com margem para os emails dos noivos.

## Segurança

- Formulários que mudam dados só são aceites se vierem deste site (`Origin`/`Sec-Fetch-Site`, em `src/middleware.ts`).
- Limites de tentativas (tabela `limites`): código errado 8/min por IP, respostas 12 por 10 min por IP, login no dashboard 10 por 15 min por IP.
- A chave que assina os cookies do código é criada sozinha na primeira vez e guardada na tabela `config`; não é preciso nenhum segredo novo.
- Os links de alteração não são indexados nem passados a outros sites (`noindex`, `Referrer-Policy: same-origin`).
- A migração `0004_convites.sql` criou também uma tabela `convites` e a coluna `rsvps.convite_id`, de uma versão com links pessoais que acabou por não ser usada. Ficam vazias e não fazem mal.

## Desenvolvimento local

```bash
npm install
cp .dev.vars.example .dev.vars   # define DASHBOARD_PASSWORD (mín. 8 caracteres)
npm run db:migrate:local
npm run dev
```

Abre http://localhost:4321. Sem `RESEND_API_KEY`, as respostas são gravadas mas o email não é enviado.

## Publicar esta versão (código de acesso)

Se o site já está publicado, basta:

```bash
npm run db:migrate:remote   # aplica migrations/0004_convites.sql (as respostas existentes ficam)
npm run deploy
```

Depois, no dashboard, define o código que vai impresso no convite. Até lá, o site continua aberto como antes.

## Publicar na Cloudflare (uma vez)

1. Inicia sessão: `npx wrangler login`
2. Cria a base de dados: `npx wrangler d1 create casamento-rsvp`
   Copia o `database_id` que aparece para `wrangler.jsonc` (substitui os zeros).
3. Cria as tabelas: `npm run db:migrate:remote`
4. Define os segredos (pede o valor no terminal):
   ```bash
   npx wrangler secret put DASHBOARD_PASSWORD
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put RSVP_TO_EMAIL
   ```
5. Publica: `npm run deploy`

Para atualizar o site depois, basta `npm run deploy`.

## Email (Resend)

- Cria conta em resend.com e gera uma API key (permissão "Sending access").
- Sem domínio verificado, o remetente `onboarding@resend.dev` só consegue enviar para o email da própria conta Resend.
- Para enviar para os noivos (ou qualquer outro endereço), verifica o domínio `virtusprompt.com` no Resend (registos DNS na Squarespace) e o remetente (`RSVP_FROM_EMAIL` em `wrangler.jsonc`) é `rsvp@virtusprompt.com`. Só os registos de envio são precisos; o "Enable receiving" fica desligado para não mexer no email da VirtusPrompt.
- Se o email falhar, a resposta fica gravada na mesma e aparece no dashboard com a etiqueta "sem email".

## Configuração

| Nome | Onde | Para quê |
| --- | --- | --- |
| `DASHBOARD_PASSWORD` | segredo | Palavra-passe do dashboard. Mudá-la termina todas as sessões abertas. |
| `RESEND_API_KEY` | segredo | Envio dos emails de RSVP. |
| `RSVP_TO_EMAIL` | segredo | Quem recebe os emails. É segredo para o email pessoal não ficar no repositório público. |
| `RSVP_FROM_EMAIL` | `wrangler.jsonc` | Remetente dos emails. |
| `site` | `astro.config.mjs` | URL final, usado na imagem de partilha. |

## Domínio próprio

Endereço atual: https://casamento-aminah-luis.virtusprompt.workers.dev

No painel da Cloudflare: Workers & Pages → casamento-aminah-luis → Settings → Domains & Routes → Add custom domain. Depois atualiza `site` em `astro.config.mjs`.

## Imagens

As fotografias e ilustrações em `public/img` foram recortadas de uma exportação do Canva (2x). Para mais nitidez, substitui os `foto-XX.webp` pelos originais, mantendo os nomes (formato vertical, aprox. 7:10).

## QR code

Em `qr-code/`:

- `qr-convite-aminah-luis.png`: cartão pronto (1500×2100 px, 300 dpi ≈ 12,7×17,8 cm).
- `qr-aminah-luis.png`: só o código, verde em branco (2000×2000 px).
- `qr-aminah-luis-transparente.png`: só o código, fundo transparente (para fundos claros).

Apontam para o endereço atual do site (sem o código: quem ler o QR tem de escrever o código impresso no convite). **Se mudarem para um domínio próprio, voltem a gerar os QR antes de imprimir**: muda `URL` em `qr-code/gerar_qr.py` e corre

```bash
python3 -m venv .venv-qr && .venv-qr/bin/pip install segno pillow opencv-python-headless
.venv-qr/bin/python qr-code/gerar_qr.py . <pasta-com-as-fontes>     # Imbue, Marcellus, Pinyon Script, Questrial (Google Fonts)
.venv-qr/bin/python qr-code/verificar_qr.py qr-code                 # confirma que todos leem bem
```

