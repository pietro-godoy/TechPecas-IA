const UserModel = require('../models/UserModel');
const { normalizeText } = require('../utils/text');

async function register(req, res) {
  const username = normalizeText(req.body.username);
  const password = String(req.body.password || '');
  const email = normalizeText(req.body.email);

  if (username.length < 3) {
    return res.status(400).json({ ok: false, msg: 'Usuário deve ter no mínimo 3 caracteres' });
  }

  if (password.length < 6) {
    return res.status(400).json({ ok: false, msg: 'Senha deve ter no mínimo 6 caracteres' });
  }

  try {
    if (await UserModel.findDuplicate(username, email)) {
      return res.status(409).json({ ok: false, msg: 'Usuário ou email já existe' });
    }

    const id = await UserModel.create({ username, password, email });

    return res.json({
      ok: true,
      msg: 'Usuário registrado com sucesso',
      usuario: {
        id,
        username,
        email: email || '',
        papel: 'cliente',
        token: await UserModel.createSession(id)
      }
    });
  } catch (error) {
    console.error('Erro ao registrar:', error.message);
    return res.status(500).json({ ok: false, msg: 'Erro ao registrar usuário.' });
  }
}

async function login(req, res) {
  const username = normalizeText(req.body.username);
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).json({ ok: false, msg: 'Usuário e senha são obrigatórios' });
  }

  try {
    const configuredAdminUsername = normalizeText(process.env.ADMIN_USERNAME);
    const configuredAdminPassword = String(process.env.ADMIN_PASSWORD || '');

    if (configuredAdminUsername && username.toLowerCase() === configuredAdminUsername.toLowerCase()) {
      let admin = await UserModel.findByUsername(configuredAdminUsername);

      if (!admin) {
        const legacyAdmin = await UserModel.findLegacyAdmin();
        if (legacyAdmin) {
          await UserModel.renameAsAdmin(legacyAdmin.id, configuredAdminUsername);
          admin = await UserModel.findByUsername(configuredAdminUsername);
        }
      }

      if (admin && configuredAdminPassword) {
        await UserModel.updatePasswordAndRoleByUsername(configuredAdminUsername, configuredAdminPassword);
      }
    }

    const usuario = await UserModel.findByCredentials(username, password);

    if (!usuario) {
      return res.status(401).json({ ok: false, msg: 'Usuário ou senha inválidos' });
    }

    if (
      configuredAdminUsername &&
      usuario.username.toLowerCase() === configuredAdminUsername.toLowerCase() &&
      usuario.papel !== 'admin'
    ) {
      await UserModel.updateRole(usuario.id, 'admin');
      usuario.papel = 'admin';
    }

    usuario.token = await UserModel.createSession(usuario.id);

    return res.json({ ok: true, msg: 'Login realizado com sucesso', usuario });
  } catch (error) {
    console.error('Erro ao fazer login:', error.message);
    return res.status(500).json({ ok: false, msg: 'Erro ao fazer login.' });
  }
}

async function me(req, res) {
  try {
    const adminUsername = normalizeText(process.env.ADMIN_USERNAME);
    let papel = req.user.papel;

    if (
      adminUsername &&
      String(req.user.username || '').toLowerCase() === adminUsername.toLowerCase() &&
      papel !== 'admin'
    ) {
      await UserModel.updateRole(req.user.id, 'admin');
      papel = 'admin';
    }

    return res.json({
      ok: true,
      usuario: {
        id: Number(req.user.id),
        username: req.user.username,
        email: req.user.email || '',
        papel
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível validar sua sessão.' });
  }
}

module.exports = { register, login, me };
