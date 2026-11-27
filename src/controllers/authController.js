const UserModel=require('../models/UserModel');
const {normalizeText}=require('../utils/text');
const {sessionToken,setSession,clearSession}=require('../middleware/security');
async function issueSession(req,res,usuario){
 const previous=sessionToken(req);if(previous)await UserModel.revokeSession(previous);
 setSession(res,await UserModel.createSession(usuario.id));
 return res.json({ok:true,usuario:{id:usuario.id,username:usuario.username,email:usuario.email||'',papel:usuario.papel||'cliente',token:'cookie'}});
}
async function register(req,res){
 const username=normalizeText(req.body.username),password=String(req.body.password||''),email=normalizeText(req.body.email);
 if(!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)||password.length<8||Buffer.byteLength(password)>256||email.length>254)return res.status(400).json({ok:false,msg:'Usuário de 3 a 40 caracteres e senha de 8 a 256 bytes são obrigatórios.'});
 const reserved=normalizeText(process.env.ADMIN_USERNAME).toLowerCase();
 if(reserved&&username.toLowerCase()===reserved)return res.status(409).json({ok:false,msg:'Usuário indisponível.'});
 try{
  if(await UserModel.findDuplicate(username,email))return res.status(409).json({ok:false,msg:'Usuário ou email já existe'});
  const id=await UserModel.create({username,password,email});
  return await issueSession(req,res,{id,username,email,papel:'cliente'});
 }catch(e){return res.status(500).json({ok:false,msg:'Erro ao registrar usuário.'});}
}
async function login(req,res){
 const username=normalizeText(req.body.username),password=String(req.body.password||'');
 if(!username||!password||username.length>100||Buffer.byteLength(password)>1024)return res.status(400).json({ok:false,msg:'Usuário e senha inválidos.'});
 try{const usuario=await UserModel.findByCredentials(username,password);if(!usuario)return res.status(401).json({ok:false,msg:'Usuário ou senha inválidos'});return await issueSession(req,res,usuario);}
 catch(e){return res.status(500).json({ok:false,msg:'Erro ao fazer login.'});}
}
async function me(req,res){const {id,username,email,papel}=req.user;return res.json({ok:true,usuario:{id,username,email:email||'',papel,token:'cookie'}});}
async function logout(req,res){try{await UserModel.revokeSession(sessionToken(req));clearSession(res);return res.json({ok:true});}catch(e){clearSession(res);return res.status(503).json({ok:false,msg:'Não foi possível revogar a sessão.'});}}
module.exports={register,login,me,logout};
