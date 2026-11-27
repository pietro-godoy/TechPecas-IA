const test=require('node:test');
const assert=require('node:assert/strict');
// Substitui somente o módulo de conexão para não acessar o MySQL.
const dbPath=require.resolve('../src/config/database');
const calls=[];
let selected=[];
let research=[];
const pool={
  query:async(sql)=>{calls.push({sql});return [[]];},
  execute:async(sql,params)=>{calls.push({sql,params});if(sql.startsWith('SELECT campo'))return [selected];if(sql.startsWith('SELECT sugestoes'))return [research];return [{affectedRows:1}];}
};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{pool}};
const model=require('../src/models/TechnicalSheetModel');
test.beforeEach(()=>{calls.length=0;selected=[];research=[];});
test('Filtro de óleo possui campos técnicos específicos',()=>{const f=model.schema('Filtro de óleo');assert.ok(f.includes('Rosca'));assert.ok(f.includes('Diâmetro externo'));assert.ok(f.includes('Código OEM'));});
test('Motor de partida possui tensão e dentes do bendix',()=>{const f=model.schema('Motor de partida');assert.ok(f.includes('Voltagem'));assert.ok(f.includes('Dentes do bendix'));});
test('Pastilha possui espessura e sensor de desgaste',()=>{const f=model.schema('Pastilha de freio');assert.ok(f.includes('Espessura'));assert.ok(f.includes('Sensor de desgaste'));});
test('Categoria desconhecida recebe apenas campos comuns',()=>{const f=model.schema('Peça desconhecida');assert.ok(f.includes('Referência do fabricante'));assert.ok(!f.includes('Dentes do bendix'));});
test('Informação ausente fica nula, sem inventar valor',async()=>{const f=await model.read(1,'Vela de ignição');assert.ok(f.length>0);assert.ok(f.every(v=>v.valor===null&&v.fonte===null));});
test('Informação cadastrada é mantida',async()=>{selected=[{campo:'Código OEM',valor:'EXEMPLO',fonte:'https://example.com'}];const f=await model.read(1,'Filtro de óleo');assert.equal(f.find(v=>v.campo==='Código OEM').valor,'EXEMPLO');});
test('Dados automáticos não sobrescrevem dados cadastrados',async()=>{selected=[{campo:'Código OEM',valor:'CADASTRADO',fonte:'https://example.com'}];research=[{sugestoes:JSON.stringify([{campo:'Código OEM',valor:'AUTOMATICO'},{campo:'Material',valor:'EXEMPLO'}])}];const f=await model.readPublic({id:1,nome:'Filtro de óleo',descricao:'Teste',fabricante:'Teste'});assert.equal(f.find(v=>v.campo==='Código OEM').valor,'CADASTRADO');assert.equal(f.find(v=>v.campo==='Material').valor,'EXEMPLO');assert.ok(calls.some(c=>c.sql.includes("status='publicado'")));});
test('Importação ignora campo desconhecido e valor sem fonte',async()=>{await model.saveImported(1,'Filtro de óleo',[{campo:'Campo inválido',valor:'Teste',fonte:'https://example.com'},{campo:'Material',valor:'Teste',fonte:''}]);assert.equal(calls.filter(c=>c.sql.startsWith('INSERT')).length,0);});
test('Importação registra campo permitido com fonte HTTP',async()=>{await model.saveImported(1,'Filtro de óleo',[{campo:'Material',valor:'Exemplo',fonte:'https://example.com'}]);const inserts=calls.filter(c=>c.sql.startsWith('INSERT IGNORE'));assert.equal(inserts.length,1);assert.deepEqual(inserts[0].params,[1,'Material','Exemplo','https://example.com']);});
test('Importação rejeita fonte com protocolo inválido',async()=>{await model.saveImported(1,'Filtro de óleo',[{campo:'Material',valor:'Exemplo',fonte:'javascript:alert(1)'}]);assert.equal(calls.filter(c=>c.sql.startsWith('INSERT')).length,0);});
