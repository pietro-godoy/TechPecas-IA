const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const migrationPath = path.join(__dirname, 'migracao_loja.sql');

  if (!fs.existsSync(migrationPath)) {
    throw new Error('Arquivo migracao_loja.sql não encontrado.');
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);
  const database = process.env.DB_NAME || 'defaultdb';
  const useSsl = String(process.env.DB_SSL || '').trim().toLowerCase() === 'true';

  console.log(`Conectando ao MySQL em ${host}:${port}/${database}...`);

  const connection = await mysql.createConnection({
    host,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database,
    port,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true,
    connectTimeout: 10000,
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
