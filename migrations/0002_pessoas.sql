-- Cada pessoa da resposta (quem responde + acompanhantes) passa a ter linha própria,
-- com a sua resposta sobre restrições alimentares.
-- Os antigos campos de texto livre deixam de ser usados (não havia respostas reais).
ALTER TABLE rsvps DROP COLUMN acompanhante;
ALTER TABLE rsvps DROP COLUMN restricoes;
ALTER TABLE rsvps ADD COLUMN acompanhantes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pessoas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  rsvp_id        INTEGER NOT NULL REFERENCES rsvps (id) ON DELETE CASCADE,
  ordem          INTEGER NOT NULL,              -- 0 = quem respondeu, 1.. = acompanhantes
  nome           TEXT    NOT NULL,
  restricao      INTEGER CHECK (restricao IN (0, 1)), -- 1 = sim, 0 = não, NULL = sem resposta
  restricao_qual TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_pessoas_rsvp ON pessoas (rsvp_id);
