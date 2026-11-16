-- Escalão de idade de cada pessoa (o preço por pessoa depende disto).
-- Quem preenche o formulário é adulto: fica sempre como '10mais' (10 ou mais anos).
-- NULL só em respostas antigas, anteriores a esta pergunta.
ALTER TABLE pessoas ADD COLUMN idade TEXT CHECK (idade IS NULL OR idade IN ('ate4', '5a9', '10mais'));
UPDATE pessoas SET idade = '10mais' WHERE ordem = 0 AND idade IS NULL;
