-- Respostas ao RSVP
CREATE TABLE IF NOT EXISTS rsvps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT    NOT NULL,
  vai          INTEGER NOT NULL CHECK (vai IN (0, 1)),
  acompanhante TEXT    NOT NULL DEFAULT '',
  restricoes   TEXT    NOT NULL DEFAULT '',
  criado_em    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  email_enviado INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rsvps_criado_em ON rsvps (criado_em);
