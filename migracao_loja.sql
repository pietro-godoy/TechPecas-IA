USE defaultdb;

-- Migração idempotente aproximada para a loja Tech Peças.
-- Execute no MySQL Workbench apenas no banco atual.

ALTER TABLE pecas
  ADD COLUMN IF NOT EXISTS imagem_url VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS ativo TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frete DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30) NOT NULL DEFAULT 'a_definir',
  ADD COLUMN IF NOT EXISTS endereco_entrega JSON NULL;

UPDATE pedidos
SET subtotal = valor_total
WHERE subtotal = 0 AND valor_total > 0;
