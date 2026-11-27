const crypto = require('crypto');
const { pool } = require('../config/database');
const {hashPassword,verifyPassword,isHash,tokenHash}=require('../utils/password');

async function findDuplicate(username, email) {
  const [rows] = await pool.execute(
    'SELECT id FROM usuarios WHERE username = ? OR email = ?',
    [username, email || '']
  );
  return rows[0] || null;
}

async function create({ username, password, email }) {
  const [result] = await pool.execute(
    "INSERT INTO usuarios (username, senha, email, papel) VALUES (?, ?, ?, 'cliente')",
    [username, await hashPassword(password), email || null]
  );
  return result.insertId;
}

async function findByCredentials(username, password) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, papel, senha FROM usuarios WHERE LOWER(username) = LOWER(?) LIMIT 1',
    [username]
  );
  const row=rows[0];
  const dummy=['scrypt','0'.repeat(32),'0'.repeat(128)].join('$');
  const valid=await verifyPassword(password,row?.senha||dummy);
  if(!row||!valid)return null;
  const {senha,...user}=row;return user;
}

async function findByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, papel FROM usuarios WHERE LOWER(username) = LOWER(?) LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function createSession(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');

  await pool.execute(
    'DELETE FROM sessoes WHERE usuario_id = ? AND expira_em IS NOT NULL AND expira_em < NOW()',
    [usuarioId]
  );

  await pool.execute(
    'INSERT INTO sessoes (id, usuario_id, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
    [tokenHash(token), usuarioId]
  );

  return token;
}

async function findBySessionToken(token) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.username, u.email, u.papel, u.asaas_customer_id
     FROM sessoes s
     INNER JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id = ?
       AND s.expira_em > NOW()
     LIMIT 1`,
    [tokenHash(token)]
  );

  return rows[0] || null;
}

async function findAdminBySessionToken(token) {
  const user = await findBySessionToken(token);
  return user && user.papel === 'admin' ? user : null;
}

async function revokeSession(token){
  if(token)await pool.execute('DELETE FROM sessoes WHERE id=?',[tokenHash(token)]);
}
async function migratePasswords(){
  const [cols]=await pool.query("SELECT CHARACTER_MAXIMUM_LENGTH AS tamanho FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='senha'");
  if(Number(cols[0]?.tamanho||0)<200)await pool.query('ALTER TABLE usuarios MODIFY COLUMN senha VARCHAR(255) NOT NULL');
  let cursor=0;
  for(;;){
    const [rows]=await pool.execute('SELECT id,senha FROM usuarios WHERE id>? ORDER BY id LIMIT 100',[cursor]);
    if(!rows.length)break;
    for(const row of rows){cursor=row.id;if(!isHash(row.senha))await pool.execute('UPDATE usuarios SET senha=? WHERE id=? AND BINARY senha=BINARY ?',[await hashPassword(row.senha),row.id,row.senha]);}
  }
}
module.exports = {
  revokeSession,migratePasswords,
  findDuplicate,
  create,
  findByCredentials,
  findByUsername,
  createSession,
  findBySessionToken,
  findAdminBySessionToken
};
