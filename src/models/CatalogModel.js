const { pool } = require('../config/database');

async function list({ termo, categoria, marca, modelo, ano }) {
  const where = ['p.ativo = 1'];
  const params = [];

  if (termo) {
    const like = '%' + termo + '%';
    where.push('(p.nome LIKE ? OR p.fabricante LIKE ? OR p.categoria LIKE ? OR p.sku LIKE ?)');
    params.push(like, like, like, like);
  }

  if (categoria) {
    where.push('LOWER(p.categoria) = LOWER(?)');
    params.push(categoria);
  }

  if (marca && modelo && ano) {
    where.push(`EXISTS (
      SELECT 1 FROM compatibilidades c
      WHERE c.peca_id = p.id
        AND LOWER(c.marca) = LOWER(?)
        AND LOWER(c.modelo) = LOWER(?)
        AND ? BETWEEN c.ano_inicio AND c.ano_fim
    )`);
    params.push(marca, modelo, ano);
  }

  const [rows] = await pool.execute(
    `SELECT p.id, p.nome, p.descricao, p.fabricante, p.categoria, p.sku,
            p.preco_site, p.estoque, p.imagem_url, p.auto_importado
     FROM pecas p
     WHERE ${where.join(' AND ')}
     ORDER BY CASE WHEN p.estoque > 0 THEN 0 ELSE 1 END,
              p.nome ASC
     LIMIT 100`,
    params
  );

  return rows;
}

async function findById(pecaId) {
  const [rows] = await pool.execute(
    `SELECT id, nome, descricao, fabricante, categoria, sku,
            preco_site, estoque, imagem_url, auto_importado
     FROM pecas
     WHERE id = ? AND ativo = 1
     LIMIT 1`,
    [pecaId]
  );

  return rows[0] || null;
}

async function listCompatibilities(pecaId) {
  const [rows] = await pool.execute(
    `SELECT marca, modelo, ano_inicio, ano_fim, observacao
     FROM compatibilidades
     WHERE peca_id = ?
     ORDER BY marca, modelo, ano_inicio`,
    [pecaId]
  );

  return rows;
}

module.exports = { list, findById, listCompatibilities };
