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

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'defaultdb',
    port: Number(process.env.DB_PORT || 3306),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true
  });

  try {
    console.log('Conectado ao banco. Executando migração da loja...');
    await connection.query(sql);
    console.log('✅ Migração da loja concluída com sucesso.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('❌ Falha na migração:', error.message);
  process.exitCode = 1;
});
