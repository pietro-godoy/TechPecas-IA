const { pool } = require('../config/database');

async function listByUser(usuarioId) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, usuario_id, tipo, termo, data_busca
       FROM historico_buscas
       WHERE usuario_id = ?
       ORDER BY data_busca DESC LIMIT 30`,
      [usuarioId]
    );
    return rows;
  } catch (error) {
    if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

    const [rows] = await pool.execute(
      `SELECT id, usuario_id, 'busca' AS tipo, termo, data_busca
       FROM historico_buscas
       WHERE usuario_id = ?
       ORDER BY data_busca DESC LIMIT 30`,
      [usuarioId]
    );
    return rows;
  }
}

async function clearByUser(usuarioId) {
  const [result] = await pool.execute(
    'DELETE FROM historico_buscas WHERE usuario_id = ?',
    [usuarioId]
  );
  return result.affectedRows;
}

module.exports = { listByUser, clearByUser };
