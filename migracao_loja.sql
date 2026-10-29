USE defaultdb;

-- Migração da loja Tech Peças sem apagar dados existentes.

SET @db_name = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'pecas' AND COLUMN_NAME = 'imagem_url') = 0,
  'ALTER TABLE pecas ADD COLUMN imagem_url VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'pecas' AND COLUMN_NAME = 'ativo') = 0,
  'ALTER TABLE pecas ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'subtotal') = 0,
  'ALTER TABLE pedidos ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'frete') = 0,
  'ALTER TABLE pedidos ADD COLUMN frete DECIMAL(10,2) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'forma_pagamento') = 0,
  'ALTER TABLE pedidos ADD COLUMN forma_pagamento VARCHAR(30) NOT NULL DEFAULT ''a_definir''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'endereco_entrega') = 0,
  'ALTER TABLE pedidos ADD COLUMN endereco_entrega JSON NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE pedidos
SET subtotal = valor_total
WHERE subtotal = 0 AND valor_total > 0;
