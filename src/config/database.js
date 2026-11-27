const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');

function buildDbSslOptions() {
  const production=process.env.NODE_ENV==='production'||Boolean(process.env.RENDER);
  const remote=!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'127.0.0.1');
  if(process.env.DB_SSL!=='true'){
    if(production&&remote)throw new Error('Banco remoto em produção exige DB_SSL=true.');
    return undefined;
  }
  const verify=String(process.env.DB_SSL_VERIFY||'true').toLowerCase()!=='false';
  if(!verify&&production)throw new Error('Produção exige DB_SSL_VERIFY=true.');
  if(!verify)return {rejectUnauthorized:false};
  const caPath=process.env.DB_CA_PATH?path.resolve(ROOT_DIR,process.env.DB_CA_PATH):path.join(ROOT_DIR,'ca.pem');
  const ca=process.env.DB_CA_PEM?process.env.DB_CA_PEM.replace(/\\n/g,'\n'):fs.existsSync(caPath)?fs.readFileSync(caPath):undefined;
  if(process.env.DB_CA_PATH&&!ca)throw new Error('Certificado CA configurado não foi encontrado.');
  return {rejectUnauthorized:true,...(ca?{ca}:{})};
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
