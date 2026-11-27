const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function buildSslOptions() {
  const production=process.env.NODE_ENV==='production'||Boolean(process.env.RENDER);
  const remote=!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'127.0.0.1');
  if(process.env.DB_SSL!=='true'){
    if(production&&remote)throw new Error('Banco remoto em produção exige DB_SSL=true.');
    return undefined;
  }
  const verify=String(process.env.DB_SSL_VERIFY||'true').toLowerCase()!=='false';
  if(!verify&&production)throw new Error('Produção exige DB_SSL_VERIFY=true.');
  if(!verify)return {rejectUnauthorized:false};
  const caPath=process.env.DB_CA_PATH?path.resolve(__dirname,process.env.DB_CA_PATH):path.join(__dirname,'ca.pem');
  const ca=process.env.DB_CA_PEM?process.env.DB_CA_PEM.replace(/\\n/g,'\n'):fs.existsSync(caPath)?fs.readFileSync(caPath):undefined;
  if(process.env.DB_CA_PATH&&!ca)throw new Error('Certificado CA configurado não foi encontrado.');
  return {rejectUnauthorized:true,verifyIdentity:true,minVersion:'TLSv1.2',...(ca?{ca}:{})};
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
