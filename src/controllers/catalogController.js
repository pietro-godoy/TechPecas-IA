const CatalogModel = require('../models/CatalogModel');
const { normalizeText } = require('../utils/text');

async function list(req, res) {
  const filters = {
    termo: normalizeText(req.query.termo),
    categoria: normalizeText(req.query.categoria),
    marca: normalizeText(req.query.marca),
    modelo: normalizeText(req.query.modelo),
    ano: Number(req.query.ano) || null
  };

  try {
    const rows = await CatalogModel.list(filters);

    return res.json({
      ok: true,
      produtos: rows.map((p) => ({
        ...p,
        preco_site: p.preco_site === null ? null : Number(p.preco_site),
        estoque: Number(p.estoque || 0),
        auto_importado: Number(p.auto_importado || 0)
      }))
    });
  } catch (error) {
    console.error('Erro ao carregar catálogo:', error.message);
    const precisaMigrar = error.code === 'ER_BAD_FIELD_ERROR';

    return res.status(500).json({
      ok: false,
      msg: precisaMigrar
        ? 'O banco ainda precisa receber a migração da loja.'
        : 'Não foi possível carregar o catálogo.'
    });
  }
}

async function detail(req, res) {
  const pecaId = Number(req.params.id);
  if (!pecaId) return res.status(400).json({ ok: false, msg: 'Produto inválido.' });

  try {
    const produto = await CatalogModel.findById(pecaId);

    if (!produto) {
      return res.status(404).json({ ok: false, msg: 'Produto não encontrado.' });
    }

    const compatibilidades = await CatalogModel.listCompatibilities(pecaId);

    produto.preco_site = produto.preco_site === null ? null : Number(produto.preco_site);
    produto.estoque = Number(produto.estoque || 0);
    produto.auto_importado = Number(produto.auto_importado || 0);

    return res.json({ ok: true, produto, compatibilidades });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar o produto.' });
  }
}

module.exports = { list, detail };
