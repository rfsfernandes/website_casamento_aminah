-- Convites pessoais, código de acesso e respostas que se podem alterar.

-- Um convite por pessoa, casal ou família. O id é aleatório e é o próprio link (/c/<id>).
CREATE TABLE IF NOT EXISTS convites (
  id               TEXT    PRIMARY KEY,
  nome             TEXT    NOT NULL,                 -- "Família Silva", "Maria e João"
  lugares          INTEGER NOT NULL CHECK (lugares BETWEEN 1 AND 10),
  email            TEXT,
  telefone         TEXT,                             -- só dígitos, com indicativo (351…)
  email_enviado_em TEXT,
  whatsapp_em      TEXT,                             -- quando se carregou em "WhatsApp" no dashboard
  desativado_em    TEXT,
  criado_em        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Respostas: de que convite vieram (NULL = pelo código impresso) e como se alteram.
ALTER TABLE rsvps ADD COLUMN convite_id TEXT REFERENCES convites (id) ON DELETE SET NULL;
ALTER TABLE rsvps ADD COLUMN edicao_hash TEXT;     -- SHA-256 do link /r/<token> (respostas pelo código)
ALTER TABLE rsvps ADD COLUMN email TEXT;           -- email opcional de quem respondeu
ALTER TABLE rsvps ADD COLUMN atualizado_em TEXT;   -- última alteração feita pelo convidado

CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_convite ON rsvps (convite_id) WHERE convite_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_edicao ON rsvps (edicao_hash) WHERE edicao_hash IS NOT NULL;

-- Definições guardadas pelo dashboard (código de acesso, mensagem do convite, chave dos cookies).
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Limites de tentativas (código errado, respostas em série, emails por dia).
CREATE TABLE IF NOT EXISTS limites (
  chave  TEXT    PRIMARY KEY,
  inicio TEXT    NOT NULL,
  n      INTEGER NOT NULL
);
