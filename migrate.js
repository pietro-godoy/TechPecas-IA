const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function buildSslOptions() {
  const useSsl = String(process.env.DB_SSL || '').trim().toLowerCase() === 'true';
  if (!useSsl) return undefined;

  const verifyCa = String(process.env.DB_SSL_VERIFY || '').trim().toLowerCase() === 'true';

  if (!verifyCa) {
    console.log('SSL: REQUIRED (criptografado, sem validação de CA)');
    return { rejectUnauthorized: false };
  }

  const configuredPath = String(process.env.DB_CA_PATH || '').trim();
  const candidate = configuredPath
    ? path.resolve(__dirname, configuredPath)
    : path.join(__dirname, 'ca.pem');

  if (!fs.existsSync(candidate)) {
    throw new Error('DB_SSL_VERIFY=true, mas o certificado CA não foi encontrado.');
  }

  console.log('SSL: VERIFY_CA usando:', candidate);
  return {
    ca: fs.readFileSync(candidate),
    rejectUnauthorized: true
  };
}

async function main() {
  const migrationPath = path.join(__dirname, 'migracao_loja.sql');

  if (!fs.existsSync(migrationPath)) {
    throw new Error('Arquivo migracao_loja.sql não encontrado.');
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);
  const database = process.env.DB_NAME || 'defaultdb';

  console.log(`Conectando ao MySQL em ${host}:${port}/${database}...`);

  const connection = await mysql.createConnection({
    host,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database,
    port,
    ssl: buildSslOptions(),
    multipleStatements: true,
    connectTimeout: 15000,
    enableKeepAlive: true
  });

  try {
    console.log('✅ Conexão estabelecida.');
    console.log('Executando migração da loja...');
    await connection.query(sql);
    console.log('✅ Migração da loja concluída com sucesso.');
  } finally {
    console.log('Encerrando conexão...');
    await connection.end();
  }
}

main().catch((error) => {
  console.error('❌ Falha na migração:', error.code || 'ERRO');
  console.error(error.message);
  process.exitCode = 1;
});
