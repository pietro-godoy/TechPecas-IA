function norm(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const stop=new Set(['de','da','do','das','dos','para','com','e','a','o','um','uma','autopeca','autopecas']);
function tokens(v){return norm(v).split(' ').filter(x=>x&&!stop.has(x));}
function has(text,word){return (' '+text+' ').includes(' '+word+' ')||(' '+text+' ').includes(' '+word+'s ');}
function matchesPart(term,title){
  const t=norm(term), n=norm(title);
  if(!t||!n)return false;
  if(/\b(batente|contra fechadura|contrafechadura|fecho)\b/.test(t)&&/\b(fechadura|porta)\b/.test(t)){
    return /\b(batentes?|contra fechadura|contrafechadura|striker|fecho)\b/.test(n)&&/\b(portas?|fechadura|striker|fecho)\b/.test(n)&&!/\b(alto falantes?|falantes?|macanetas?|puxadores?|amortecedores?|dobradicas?)\b/.test(n);
  }
  const words=tokens(t);
  return words.length>0&&words.every(w=>has(n,w)|| (w.endsWith('s')&&has(n,w.slice(0,-1))));
}
function vehicleStatus(title,{marca,modelo,ano}={}){
  if(!modelo)return 'nao_informado';
  const n=norm(title), m=norm(modelo);
  if(!(' '+n+' ').includes(' '+m+' '))return 'nao_confirmado';
  const years=[...n.matchAll(/\b(?:19|20)\d{2}\b/g)].map(x=>Number(x[0]));
  const y=Number(ano);
  if(y&&years.length&&!years.includes(y)){
    // An explicit range may span the requested year.
    const range=String(title).match(/((?:19|20)\d{2})\s*(?:a|ate|até|[-–/])\s*((?:19|20)\d{2})/gi)||[];
    if(!range.some(r=>{const z=r.match(/\d{4}/g).map(Number);return y>=z[0]&&y<=z[1];}))return 'ano_divergente';
  }
  return 'modelo_mencionado';
}
function relevantOffer(term,product,vehicle){
  if(!matchesPart(term,product.title))return false;
  if(vehicle?.modelo&&vehicleStatus(product.title,vehicle)!=='modelo_mencionado')return false;
  return true;
}
module.exports={matchesPart,vehicleStatus,relevantOffer,norm,tokens};