const VehicleModel = require('../models/VehicleModel');
const { normalizeText } = require('../utils/text');

async function list(req, res) {
  const usuarioId = Number(req.query.usuarioId);
  if (!usuarioId) return res.status(400).json({ ok: false, msg: 'ID do usuário obrigatório.' });

  try {
    return res.json({ ok: true, veiculos: await VehicleModel.listByUser(usuarioId) });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao carregar veículos.' });
  }
}

async function create(req, res) {
  const usuarioId = Number(req.body.usuarioId);
  const marca = normalizeText(req.body.marca);
  const modelo = normalizeText(req.body.modelo);
  const ano = Number(req.body.ano);
  const versao = normalizeText(req.body.versao);

  if (!usuarioId || !marca || !modelo || !ano) {
    return res.status(400).json({ ok: false, msg: 'Usuário, marca, modelo e ano são obrigatórios.' });
  }

  try {
    const id = await VehicleModel.create({ usuarioId, marca, modelo, ano, versao });
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao salvar veículo.' });
  }
}

async function remove(req, res) {
  const veiculoId = Number(req.params.id);
  const usuarioId = Number(req.body.usuarioId);

  if (!veiculoId || !usuarioId) {
    return res.status(400).json({ ok: false, msg: 'Veículo e usuário são obrigatórios.' });
  }

  try {
    const affected = await VehicleModel.remove({ veiculoId, usuarioId });

    if (!affected) {
      return res.status(404).json({ ok: false, msg: 'Veículo não encontrado.' });
    }

    return res.json({ ok: true, msg: 'Veículo removido da garagem.' });
  } catch (error) {
    console.error('Erro ao remover veículo:', error.message);
    return res.status(500).json({ ok: false, msg: 'Erro ao remover veículo.' });
  }
}

module.exports = { list, create, remove };
