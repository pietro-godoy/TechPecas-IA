const UserModel = require('../models/UserModel');

function bearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function requireUser(req, res, next) {
  const token = bearerToken(req);

  if (!token) {
    return res.status(401).json({ ok: false, msg: 'Faça login para continuar.' });
  }

  try {
    const user = await UserModel.findBySessionToken(token);

    if (!user) {
      return res.status(401).json({ ok: false, msg: 'Sua sessão expirou. Entre novamente.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível validar sua sessão.' });
  }
}

async function requireAdmin(req, res, next) {
  const token = bearerToken(req);

  if (!token) {
    return res.status(401).json({ ok: false, msg: 'Faça login para acessar o painel administrativo.' });
  }

  try {
    const admin = await UserModel.findAdminBySessionToken(token);

    if (!admin) {
      return res.status(403).json({ ok: false, msg: 'Acesso permitido somente para administrador.' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível validar o acesso administrativo.' });
  }
}

function requireCustomer(req, res, next) {
  return requireUser(req, res, () => {
    if (req.user?.papel === 'admin') {
      return res.status(403).json({
        ok: false,
        msg: 'Contas administrativas não podem realizar compras.'
      });
    }

    next();
  });
}

module.exports = { requireUser, requireAdmin, requireCustomer };
