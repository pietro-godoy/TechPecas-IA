const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, projeto: 'Tech Peças', msg: 'Servidor rodando' });
});

module.exports = router;
