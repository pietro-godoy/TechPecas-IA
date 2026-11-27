const cookieName='tp_session';
const cookieOptions={httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production'||Boolean(process.env.RENDER),path:'/',maxAge:7*24*60*60*1000};
function sessionToken(req){
 const cookies=String(req.headers.cookie||'').split(';');
 for(const c of cookies){const [key,...value]=c.trim().split('=');if(key===cookieName){const token=value.join('=');return /^[a-f0-9]{64}$/.test(token)?token:'';}}
 return '';
}
function setSession(res,token){res.cookie(cookieName,token,cookieOptions);}
function clearSession(res){const {maxAge,...opts}=cookieOptions;res.clearCookie(cookieName,opts);}
function rateLimit({limit,windowMs,key=req=>req.ip}){
 const entries=new Map();
 return (req,res,next)=>{
  const now=Date.now();
  if(entries.size>5000){for(const [k,v] of entries)if(v.until<=now)entries.delete(k);}
  const id=String(key(req)||'unknown');
  if(!entries.has(id)&&entries.size>=10000)return res.status(429).json({ok:false,msg:'Limite temporário de requisições.'});
  let item=entries.get(id);
  if(!item||item.until<=now){item={count:0,until:now+windowMs};entries.set(id,item);}
  if(++item.count>limit){res.set('Retry-After',String(Math.ceil((item.until-now)/1000)));return res.status(429).json({ok:false,msg:'Muitas solicitações. Tente novamente mais tarde.'});}
  next();
 };
}
function sameOrigin(req,res,next){
 if(['GET','HEAD','OPTIONS'].includes(req.method)||req.path==='/webhooks/asaas')return next();
 const origin=req.get('origin');
 const own=req.protocol+'://'+req.get('host');
 const allowed=String(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(req.get('sec-fetch-site')==='cross-site'||(origin&&origin!==own&&!allowed.includes(origin)))return res.status(403).json({ok:false,msg:'Origem não permitida.'});
 next();
}
function headers(req,res,next){
 res.set('X-Content-Type-Options','nosniff');
 res.set('X-Frame-Options','DENY');
 res.set('Referrer-Policy','strict-origin-when-cross-origin');
 res.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if(req.secure)res.set('Strict-Transport-Security','max-age=31536000');
 if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');
 next();
}
module.exports={sessionToken,setSession,clearSession,rateLimit,sameOrigin,headers};