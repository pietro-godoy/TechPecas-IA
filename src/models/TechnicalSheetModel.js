const { pool } = require('../config/database');
const fields = {
  common: ['Código OEM','Referência do fabricante','Material','Dimensões','Posição de instalação','Garantia'],
  filtro: ['Altura','Diâmetro externo','Rosca','Válvula antirretorno'],
  vela: ['Rosca','Comprimento da rosca','Grau térmico','Material do eletrodo','Folga do eletrodo'],
  pastilha: ['Comprimento','Altura','Espessura','Sensor de desgaste','Quantidade por embalagem'],
  amortecedor: ['Eixo','Lado','Tipo'],
  bieleta: ['Comprimento','Rosca','Lado'],
  coxim: ['Motorização','Tipo de suporte']
};
function schema(name) {
  const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const key=Object.keys(fields).find(k=>k!=='common'&&n.includes(k));
  return [...fields.common,...(fields[key]||[])];
}
async function ensure(){
  await pool.query('CREATE TABLE IF NOT EXISTS produto_ficha_tecnica (peca_id INT NOT NULL, campo VARCHAR(100) NOT NULL, valor VARCHAR(500) NOT NULL, fonte VARCHAR(700) NOT NULL, atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (peca_id,campo))');
}
async function read(id,name){
  await ensure();
  const [rows]=await pool.execute('SELECT campo,valor,fonte FROM produto_ficha_tecnica WHERE peca_id=? ORDER BY campo',[id]);
  const map=new Map(rows.map(r=>[r.campo,r]));
  return [...new Set([...schema(name),...map.keys()])].map(campo=>map.get(campo)||{campo,valor:null,fonte:null});
}
async function save(id,name,entries){
  if(!Array.isArray(entries)||entries.length>40)throw new Error('Ficha inválida');
  const allowed=new Set(schema(name));
  const clean=entries.map(r=>({campo:String(r.campo||'').trim(),valor:String(r.valor||'').trim(),fonte:String(r.fonte||'').trim()}));
  if(clean.some(r=>!allowed.has(r.campo)||r.valor.length>500||r.fonte.length>700||(r.valor&&!/^https?:\/\//i.test(r.fonte))))throw new Error('Informe campos válidos e a URL da fonte para cada valor.');
  await ensure();
  const conn=await pool.getConnection();
  try{await conn.beginTransaction();for(const r of clean){if(!r.valor)await conn.execute('DELETE FROM produto_ficha_tecnica WHERE peca_id=? AND campo=?',[id,r.campo]);else await conn.execute('INSERT INTO produto_ficha_tecnica (peca_id,campo,valor,fonte) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor),fonte=VALUES(fonte)',[id,r.campo,r.valor,r.fonte]);}await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
  return read(id,name);
}
module.exports={read,save,ensure};