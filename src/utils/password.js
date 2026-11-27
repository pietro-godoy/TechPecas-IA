const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const options={N:32768,r:8,p:3,maxmem:64*1024*1024};
async function hashPassword(password){
 const salt=crypto.randomBytes(16).toString('hex');
 const key=await scrypt(String(password),salt,64,options);
 return 'scrypt$'+salt+'$'+key.toString('hex');
}
function isHash(value){return /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(String(value||''));}
async function verifyPassword(password,stored){
 if(!isHash(stored)||Buffer.byteLength(String(password))>1024)return false;
 const [,salt,key]=stored.split('$');
 const actual=await scrypt(String(password),salt,64,options);
 return crypto.timingSafeEqual(actual,Buffer.from(key,'hex'));
}
const tokenHash=token=>crypto.createHash('sha256').update(String(token)).digest('hex');
module.exports={hashPassword,verifyPassword,isHash,tokenHash};