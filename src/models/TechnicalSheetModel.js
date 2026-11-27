const { pool } = require('../config/database');
const fields = {
  common: ['Fabricante identificado','Aplicações informadas na fonte','Motorização e versão','Conteúdo da embalagem','Informações gerais da peça','Código OEM','Referência do fabricante','Material','Dimensões','Posição de instalação','Garantia'],
  'motor de partida': ['Dentes do bendix','Sentido de rotação','Voltagem','Potência','Tipo de veículo','Fixação'],
  alternador: ['Voltagem','Corrente nominal','Tipo de polia','Fixação'],
  bateria: ['Voltagem','Capacidade','Corrente de partida','Polaridade'],
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
async function readPublic(p){
  const ficha=await read(p.id,p.nome);
  try{
    const ref=ficha.find(x=>x.campo==='Referência do fabricante')?.valor;
    const identity=ref?p.fabricante+'|'+ref:'texto2|'+require('crypto').createHash('sha256').update((p.nome||'')+'|'+(p.descricao||'')).digest('hex');
    const [rows]=await pool.execute("SELECT sugestoes FROM produto_ficha_pesquisa WHERE peca_id=? AND identidade=? AND status='publicado'",[p.id,identity]);
    const raw=rows[0]?.sugestoes;
    const published=typeof raw==='string'?JSON.parse(raw):raw;
    if(!Array.isArray(published))return ficha;
    return ficha.map(item=>item.valor?item:published.find(x=>x.campo===item.campo)||item);
  }catch(e){if(e.code!=='ER_NO_SUCH_TABLE')console.warn('Ficha automática indisponível:',e.code||'erro');return ficha;}
}
async function saveImported(id,name,entries){
  await ensure();
  const allowed=new Set(schema(name));
  for(const item of entries){
    if(!allowed.has(item.campo)||typeof item.valor!=='string'||!item.valor.trim()||item.valor.length>500||typeof item.fonte!=='string'||item.fonte.length>700||!/^https?:\/\//i.test(item.fonte))continue;
    await pool.execute('INSERT IGNORE INTO produto_ficha_tecnica (peca_id,campo,valor,fonte) VALUES (?,?,?,?)',[id,item.campo,item.valor,item.fonte]);
  }
}
module.exports={read,readPublic,save,ensure,schema,saveImported};