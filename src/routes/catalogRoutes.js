const express = require('express');
const controller = require('../controllers/catalogController');

const router = express.Router();
const { pool } = require('../config/database');
const { requireCustomer } = require('../middleware/authMiddleware');
const CatalogModel = require('../models/CatalogModel');
async function ensureReviews() {
  await pool.query('CREATE TABLE IF NOT EXISTS produto_avaliacoes (peca_id INT NOT NULL, usuario_id INT NOT NULL, nota TINYINT NOT NULL, comentario VARCHAR(1000) NOT NULL, atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (peca_id, usuario_id))');
}
router.get('/:id/avaliacoes', async (req,res) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<=0) return res.status(400).json({ok:false});
    await ensureReviews();
    const [avaliacoes]=await pool.execute('SELECT nota, comentario FROM produto_avaliacoes WHERE peca_id=? ORDER BY atualizado_em DESC LIMIT 100',[id]);
    res.json({ok:true,avaliacoes});
  } catch(e){res.status(500).json({ok:false,msg:'Avaliações indisponíveis.'});}
});
router.post('/:id/avaliacoes', requireCustomer, async (req,res) => {
  try {
    const id=Number(req.params.id), nota=Number(req.body.nota), comentario=String(req.body.comentario||'').trim();
    if(!Number.isSafeInteger(id)||id<=0||!Number.isInteger(nota)||nota<1||nota>5||!comentario||comentario.length>1000) return res.status(400).json({ok:false,msg:'Informe uma nota e um comentário válido.'});
    if(!await CatalogModel.findById(id)) return res.status(404).json({ok:false,msg:'Produto não encontrado.'});
    const [compras]=await pool.execute("SELECT 1 FROM pedidos p JOIN itens_pedido i ON i.pedido_id=p.id WHERE p.usuario_id=? AND i.peca_id=? AND p.status='pago' LIMIT 1",[req.user.id,id]);
    if(!compras.length) return res.status(403).json({ok:false,msg:'Somente clientes com compra confirmada podem avaliar este produto.'});
    await ensureReviews();
    await pool.execute('INSERT INTO produto_avaliacoes (peca_id,usuario_id,nota,comentario) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE nota=VALUES(nota),comentario=VALUES(comentario)',[id,req.user.id,nota,comentario]);
    res.json({ok:true});
  } catch(e){res.status(500).json({ok:false,msg:'Não foi possível salvar a avaliação.'});}
});

const TechnicalSheet = require('../models/TechnicalSheetModel');
const { requireAdmin } = require('../middleware/authMiddleware');
router.get('/:id/ficha-tecnica', async (req,res)=>{
  try{const p=await CatalogModel.findById(Number(req.params.id));if(!p)return res.status(404).json({ok:false,msg:'Produto não encontrado.'});res.json({ok:true,ficha:await TechnicalSheet.readPublic(p)});}
  catch(e){res.status(500).json({ok:false,msg:'Ficha técnica indisponível.'});}
});
router.get('/:id/ficha-pesquisa',requireAdmin,async(req,res)=>{
  try{const p=await CatalogModel.findById(Number(req.params.id));if(!p)return res.status(404).json({ok:false});const ficha=await TechnicalSheet.read(p.id,p.nome);const ref=ficha.find(x=>x.campo==='Referência do fabricante')?.valor; const identity=ref?p.fabricante+'|'+ref:'externo|'+require('crypto').createHash('sha256').update(p.descricao||'').digest('hex');const [rows]=await pool.execute("SELECT sugestoes FROM produto_ficha_pesquisa WHERE peca_id=? AND identidade=? AND status='pendente'",[p.id,identity]);const raw=rows[0]?.sugestoes;res.json({ok:true,sugestoes:typeof raw==='string'?JSON.parse(raw):raw||[]});}catch(e){res.json({ok:true,sugestoes:[]});}
});
router.put('/:id/ficha-tecnica',requireAdmin,async(req,res)=>{
  try{const p=await CatalogModel.findById(Number(req.params.id));if(!p)return res.status(404).json({ok:false,msg:'Produto não encontrado.'});res.json({ok:true,ficha:await TechnicalSheet.save(p.id,p.nome,req.body.ficha)});}
  catch(e){res.status(400).json({ok:false,msg:'Não foi possível salvar. Confira os campos e as fontes.'});}
});
router.get('/', controller.list);
router.get('/:id', controller.detail);

module.exports = router;
