USE defaultdb;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS itens_pedido;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS consultas_ia;
DROP TABLE IF EXISTS historico_buscas;
DROP TABLE IF EXISTS ofertas;
DROP TABLE IF EXISTS fornecedores;
DROP TABLE IF EXISTS compatibilidades;
DROP TABLE IF EXISTS pecas;
DROP TABLE IF EXISTS veiculos;
DROP TABLE IF EXISTS sessoes;
DROP TABLE IF EXISTS usuarios;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  email VARCHAR(150) UNIQUE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessoes (
  id VARCHAR(200) PRIMARY KEY,
  usuario_id INT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expira_em TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_sessoes_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE CASCADE
);

CREATE TABLE veiculos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  marca VARCHAR(80) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  ano INT NOT NULL,
  versao VARCHAR(120),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_veiculos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE CASCADE
);

CREATE TABLE pecas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(140) NOT NULL,
  descricao TEXT,
  fabricante VARCHAR(120),
  categoria VARCHAR(100),
  sku VARCHAR(80) UNIQUE,
  preco_site DECIMAL(10,2),
  estoque INT NOT NULL DEFAULT 0,
  imagem_url VARCHAR(500),
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE compatibilidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  peca_id INT NOT NULL,
  marca VARCHAR(80) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  ano_inicio INT NOT NULL,
  ano_fim INT NOT NULL,
  observacao VARCHAR(255),
  CONSTRAINT fk_compatibilidades_peca
    FOREIGN KEY (peca_id) REFERENCES pecas(id)
    ON DELETE CASCADE
);

CREATE TABLE fornecedores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(140) NOT NULL,
  site VARCHAR(255),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ofertas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fornecedor_id INT NOT NULL,
  peca_id INT NOT NULL,
  preco DECIMAL(10,2) NOT NULL,
  link_compra VARCHAR(500),
  disponivel TINYINT(1) NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ofertas_fornecedor
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ofertas_peca
    FOREIGN KEY (peca_id) REFERENCES pecas(id)
    ON DELETE CASCADE
);

CREATE TABLE historico_buscas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'busca',
  termo VARCHAR(255) NOT NULL,
  data_busca TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_historico_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE CASCADE
);

CREATE TABLE consultas_ia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT,
  veiculo_texto VARCHAR(255) NOT NULL,
  problema TEXT NOT NULL,
  resposta JSON NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_consultas_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE SET NULL
);

CREATE TABLE pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  frete DECIMAL(10,2) NOT NULL DEFAULT 0,
  valor_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  forma_pagamento VARCHAR(30) NOT NULL DEFAULT 'a_definir',
  endereco_entrega JSON,
  status VARCHAR(40) NOT NULL DEFAULT 'aguardando_pagamento',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pedidos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE CASCADE
);

CREATE TABLE itens_pedido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  peca_id INT NOT NULL,
  quantidade INT NOT NULL DEFAULT 1,
  preco_unitario DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_itens_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_itens_peca
    FOREIGN KEY (peca_id) REFERENCES pecas(id)
);

-- Dados fictícios apenas para testar o protótipo.
INSERT INTO pecas (nome, descricao, fabricante, categoria, sku, preco_site, estoque) VALUES
('Pastilha de freio dianteira', 'Jogo de pastilhas dianteiras para demonstração.', 'DemoParts', 'Freios', 'DEMO-FREIO-001', 129.90, 8),
('Filtro de óleo', 'Filtro de óleo para demonstração do catálogo.', 'DemoParts', 'Motor', 'DEMO-FILTRO-001', 39.90, 15),
('Vela de ignição', 'Vela de ignição para demonstração do catálogo.', 'DemoParts', 'Ignição', 'DEMO-VELA-001', 29.90, 20);

INSERT INTO compatibilidades (peca_id, marca, modelo, ano_inicio, ano_fim, observacao) VALUES
(1, 'Chevrolet', 'Onix', 2020, 2026, 'Compatibilidade fictícia para teste'),
(2, 'Volkswagen', 'Gol', 2012, 2022, 'Compatibilidade fictícia para teste'),
(3, 'Fiat', 'Argo', 2017, 2026, 'Compatibilidade fictícia para teste');

INSERT INTO fornecedores (nome, site) VALUES
('Fornecedor Demo A', 'https://example.com'),
('Fornecedor Demo B', 'https://example.org');

INSERT INTO ofertas (fornecedor_id, peca_id, preco, link_compra, disponivel) VALUES
(1, 1, 139.90, 'https://example.com', 1),
(2, 1, 134.50, 'https://example.org', 1),
(1, 2, 44.90, 'https://example.com', 1);
