const test=require('node:test');
const assert=require('node:assert/strict');
const {hashPassword,verifyPassword,isHash,tokenHash}=require('../src/utils/password');
const {sessionToken,rateLimit,sameOrigin,setSession,clearSession}=require('../src/middleware/security');
function response(){
 const r={code:200,body:null,headers:{},cookieData:null,status(n){this.code=n;return this;},json(x){this.body=x;return this;},set(k,v){this.headers[k]=v;return this;},cookie(n,v,o){this.cookieData={n,v,o};},clearCookie(n,o){this.cleared={n,o};}};
 return r;
}
test('Senha nunca é armazenada em texto puro',async()=>{
 const hash=await hashPassword('SenhaExemplo!');assert.ok(isHash(hash));assert.notEqual(hash,'SenhaExemplo!');assert.ok(await verifyPassword('SenhaExemplo!',hash));assert.equal(await verifyPassword('outra',hash),false);
});
test('Hashes da mesma senha possuem salts diferentes',async()=>{assert.notEqual(await hashPassword('TesteForte!'),await hashPassword('TesteForte!'));});
test('Credenciais em texto puro ou hash inválido não autenticam',async()=>{assert.equal(await verifyPassword('teste','teste'),false);assert.equal(await verifyPassword('teste','scrypt$invalido'),false);});
test('Token armazenado é hash e não o segredo original',()=>{const t='a'.repeat(64);assert.notEqual(tokenHash(t),t);assert.equal(tokenHash(t).length,64);});
test('Sessão só é lida de cookie válido',()=>{const t='a'.repeat(64);assert.equal(sessionToken({headers:{cookie:'tp_session='+t}}),t);assert.equal(sessionToken({headers:{authorization:'Bearer '+t}}),'');assert.equal(sessionToken({headers:{cookie:'tp_session=invalido'}}),'');});
test('Cookie de autenticação usa HttpOnly e SameSite estrito',()=>{const r=response();setSession(r,'a'.repeat(64));assert.equal(r.cookieData.o.httpOnly,true);assert.equal(r.cookieData.o.sameSite,'strict');assert.equal(r.cookieData.o.path,'/');clearSession(r);assert.equal(r.cleared.n,r.cookieData.n);assert.equal(r.cleared.o.maxAge,undefined);});
test('Limite de requisições bloqueia tentativas excessivas',()=>{const limit=rateLimit({limit:2,windowMs:60000});let next=0;const req={ip:'127.0.0.1'};limit(req,response(),()=>next++);limit(req,response(),()=>next++);const r=response();limit(req,r,()=>next++);assert.equal(next,2);assert.equal(r.code,429);});
test('POST de outra origem é rejeitado',()=>{const r=response();const req={method:'POST',path:'/pedidos',protocol:'https',get:k=>({origin:'https://invalid.example',host:'tech.example','sec-fetch-site':'cross-site'})[k]};sameOrigin(req,r,()=>assert.fail('Não deve continuar'));assert.equal(r.code,403);});
test('POST da própria origem passa',()=>{const r=response();let next=false;const req={method:'POST',path:'/pedidos',protocol:'https',get:k=>({origin:'https://tech.example',host:'tech.example','sec-fetch-site':'same-origin'})[k]};sameOrigin(req,r,()=>next=true);assert.equal(next,true);});
test('Garagem e histórico utilizam somente o ID da sessão',async()=>{
 const vehicle=require.resolve('../src/models/VehicleModel'),history=require.resolve('../src/models/HistoryModel');
 let ids=[];
 require.cache[vehicle]={id:vehicle,filename:vehicle,loaded:true,exports:{listByUser:async id=>{ids.push(id);return [];},create:async v=>{ids.push(v.usuarioId);return 1;},remove:async v=>{ids.push(v.usuarioId);return 1;}}};
 require.cache[history]={id:history,filename:history,loaded:true,exports:{listByUser:async id=>{ids.push(id);return [];},clearByUser:async id=>{ids.push(id);return 1;}}};
 const vc=require('../src/controllers/vehicleController'),hc=require('../src/controllers/historyController');
 const req={user:{id:7},query:{usuarioId:99},body:{usuarioId:99,marca:'Teste',modelo:'Teste',ano:2020},params:{id:1}};
 await vc.list(req,response());await vc.create(req,response());await vc.remove(req,response());await hc.list(req,response());await hc.clear(req,response());assert.deepEqual(ids,[7,7,7,7,7]);
});
test('Cliente sem privilégio não passa pelo middleware administrativo',async()=>{
 const user=require.resolve('../src/models/UserModel');
 require.cache[user]={id:user,filename:user,loaded:true,exports:{findAdminBySessionToken:async()=>null,findBySessionToken:async()=>null}};
 const {requireAdmin,requireUser}=require('../src/middleware/authMiddleware');
 let r=response();await requireAdmin({headers:{cookie:'tp_session='+'a'.repeat(64)}},r,()=>assert.fail('Acesso não autorizado'));assert.equal(r.code,403);
 r=response();await requireUser({headers:{}},r,()=>assert.fail('Acesso anônimo'));assert.equal(r.code,401);
});
