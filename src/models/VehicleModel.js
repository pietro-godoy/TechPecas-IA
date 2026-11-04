const { pool } = require('../config/database');

async function listByUser(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT id, marca, modelo, ano, versao, criado_em
     FROM veiculos
     WHERE usuario_id = ?
     ORDER BY criado_em DESC`,
    [usuarioId]
  );
  return rows;
}

async function create({ usuarioId, marca, modelo, ano, versao }) {
  const [result] = await pool.execute(
    'INSERT INTO veiculos (usuario_id, marca, modelo, ano, versao) VALUES (?, ?, ?, ?, ?)',
    [usuarioId, marca, modelo, ano, versao || null]
  );
  return result.insertId;
}

async function remove({ veiculoId, usuarioId }) {
  const [result] = await pool.execute(
    'DELETE FROM veiculos WHERE id = ? AND usuario_id = ?',
    [veiculoId, usuarioId]
  );
  return result.affectedRows;
}

module.exports = { listByUser, create, remove };
