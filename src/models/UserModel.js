const crypto = require('crypto');
const { pool } = require('../config/database');

async function findDuplicate(username, email) {
  const [rows] = await pool.execute(
    'SELECT id FROM usuarios WHERE username = ? OR email = ?',
    [username, email || '']
  );
  return rows[0] || null;
}

async function create({ username, password, email }) {
  const [result] = await pool.execute(
    'INSERT INTO usuarios (username, senha, email) VALUES (?, ?, ?)',
    [username, password, email || null]
  );
  return result.insertId;
}

async function findByCredentials(username, password) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, papel FROM usuarios WHERE LOWER(username) = LOWER(?) AND senha = ? LIMIT 1',
    [username, password]
  );
  return rows[0] || null;
}

async function findByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, papel FROM usuarios WHERE LOWER(username) = LOWER(?) LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function findLegacyAdmin() {
  const [rows] = await pool.execute(
    "SELECT id, username, email, papel FROM usuarios WHERE LOWER(username) = LOWER('Godoy') LIMIT 1"
  );
  return rows[0] || null;
}

async function renameAsAdmin(id, username) {
  await pool.execute(
    "UPDATE usuarios SET username = ?, papel = 'admin' WHERE id = ?",
    [username, id]
  );
}

async function updatePasswordAndRoleByUsername(username, password) {
  await pool.execute(
    "UPDATE usuarios SET senha = ?, papel = 'admin' WHERE LOWER(username) = LOWER(?)",
    [password, username]
  );
}

async function updateRole(id, role) {
  await pool.execute('UPDATE usuarios SET papel = ? WHERE id = ?', [role, id]);
}

async function createSession(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');

  await pool.execute(
    'DELETE FROM sessoes WHERE usuario_id = ? AND expira_em IS NOT NULL AND expira_em < NOW()',
    [usuarioId]
  );

  await pool.execute(
    'INSERT INTO sessoes (id, usuario_id, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
    [token, usuarioId]
  );

  return token;
}

async function findBySessionToken(token) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.username, u.email, u.papel, u.asaas_customer_id
     FROM sessoes s
     INNER JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id = ?
       AND (s.expira_em IS NULL OR s.expira_em > NOW())
     LIMIT 1`,
    [token]
  );

  return rows[0] || null;
}

async function findAdminBySessionToken(token) {
  const user = await findBySessionToken(token);
  return user && user.papel === 'admin' ? user : null;
}

module.exports = {
  findDuplicate,
  create,
  findByCredentials,
  findByUsername,
  findLegacyAdmin,
  renameAsAdmin,
  updatePasswordAndRoleByUsername,
  updateRole,
  createSession,
  findBySessionToken,
  findAdminBySessionToken
};
