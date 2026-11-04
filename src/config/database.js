const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');

function buildDbSslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined;

  const verifyCa = String(process.env.DB_SSL_VERIFY || '').trim().toLowerCase() === 'true';

  if (!verifyCa) {
    return { rejectUnauthorized: false };
  }

  const caPath = process.env.DB_CA_PATH
    ? path.resolve(ROOT_DIR, process.env.DB_CA_PATH)
    : path.join(ROOT_DIR, 'ca.pem');

  if (!fs.existsSync(caPath)) {
    throw new Error('DB_SSL_VERIFY=true, mas o certificado CA não foi encontrado.');
  }

  return {
    ca: fs.readFileSync(caPath),
    rejectUnauthorized: true
  };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'techpecas',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  ssl: buildDbSslOptions()
});

module.exports = { pool };
