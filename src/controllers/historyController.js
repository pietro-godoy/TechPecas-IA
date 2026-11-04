const HistoryModel = require('../models/HistoryModel');

async function list(req, res) {
  const usuarioId = Number(req.query.usuarioId);
  if (!usuarioId) return res.status(400).json({ ok: false, msg: 'ID do usuário é obrigatório' });

  try {
    return res.json({ ok: true, historico: await HistoryModel.listByUser(usuarioId) });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao obter histórico de buscas' });
  }
}

async function clear(req, res) {
  const usuarioId = Number(req.body.usuarioId);
  if (!usuarioId) return res.status(400).json({ ok: false, msg: 'ID do usuário é obrigatório' });

  try {
    const deletedRows = await HistoryModel.clearByUser(usuarioId);
    return res.json({ ok: true, deletedRows });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao limpar histórico de buscas' });
  }
}

module.exports = { list, clear };
