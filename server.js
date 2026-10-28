const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}/api`;
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

const aiCache = new Map();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'techpecas',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true
});

pool.getConnection()
  .then((conn) => {
    console.log('✅ Conexão com banco de dados estabelecida');
    conn.release();
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar ao banco de dados:', err.message);
  });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

function normalizeText(value) {
  return String(value || '').trim();
}

function cacheGet(key) {
  const item = aiCache.get(key);
  if (!item) return null;
  if (Date.now() - item.createdAt > 6 * 60 * 60 * 1000) {
    aiCache.delete(key);
    return null;
  }
  return item.data;
}

function cacheSet(key, data) {
  aiCache.set(key, { data, createdAt: Date.now() });
}

function parseGeminiJson(rawText) {
  let text = String(rawText || '').trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeminiStatus(error) {
  const directStatus = Number(error?.status || error?.response?.status || error?.statusCode);
  if (Number.isFinite(directStatus) && directStatus > 0) return directStatus.

  const message = String(error?.message || error || '');
  const match = message.match(/\[(\d{3})\s/);
  return match ? Number(match[1]) : null;
}

function isTransientGeminiError(error) {
  const status = getGeminiStatus(error);
  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) return true;

  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('service unavailable') ||
    message.includes('high demand') ||
    message.includes('resource exhausted') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('etimedout')
  );
}

async function generateWithRetry(modelName, prompt, maxRetries, baseDelayMs) {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await model.generateContent(prompt);
      return {
        data: parseGeminiJson(result.response.text()),
        model: modelName,
        attempts: attempt + 1
      };
    } catch (error) {
      lastError = error;

      if (!isTransientGeminiError(error) || attempt === maxRetries) {
        throw error;
      }

      // Backoff exponencial com pequeno jitter para evitar novas tentativas simultâneas.
      const exponentialDelay = baseDelayMs * (2 ** attempt);
      const jitter = Math.floor(Math.random() * Math.max(250, baseDelayMs * 0.35));
      const delay = exponentialDelay + jitter;
      const status = getGeminiStatus(error) || 'temporário';

      console.warn(
        `⚠️ Gemini ${modelName} indisponível (${status}). ` +
        `Tentativa ${attempt + 1}/${maxRetries + 1}; nova tentativa em ${delay}ms...`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

async function generateJsonWithGemini(prompt) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY não configurada');
  }

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash';
  const maxRetries = Math.max(0, Number(process.env.GEMINI_RETRIES ?? 2));
  const baseDelayMs = Math.max(250, Number(process.env.GEMINI_RETRY_BASE_MS ?? 1000));
  const models = [...new Set([primaryModel, fallbackModel].filter(Boolean))];
  let lastError;

  for (const modelName of models) {
    try {
      const response = await generateWithRetry(modelName, prompt, maxRetries, baseDelayMs);

      if (modelName !== primaryModel) {
        console.log(`✅ Gemini respondeu usando o modelo reserva: ${modelName}`);
      }

      return response.data;
    } catch (error) {
      lastError = error;

      // Erros permanentes (ex.: API key inválida) não devem ser mascarados tentando outro modelo.
      if (!isTransientGeminiError(error)) {
        throw error;
      }

      if (modelName !== models[models.length - 1]) {
        console.warn(`🔁 Mudando do modelo ${modelName} para o modelo reserva ${fallbackModel}...`);
      }
    }
  }

  throw lastError || new Error('Gemini indisponível no momento.');
}

async function saveHistory(usuarioId, termo, tipo = 'busca') {
  if (!usuarioId || !termo) return;
  try {
    await pool.execute(
      `INSERT INTO historico_buscas (usuario_id, tipo, termo)
       VALUES (?, ?, ?)`,
      [usuarioId, tipo, termo]
    );
  } catch (error) {
    // Compatibilidade com o banco antigo, que ainda não possuía a coluna "tipo".
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      await pool.execute(
        'INSERT INTO historico_buscas (usuario_id, termo) VALUES (?, ?)',
        [usuarioId, termo]
      );
      return;
    }
    console.warn('Não foi possível salvar histórico:', error.message);
  }
}

// -------------------- AUTENTICAÇÃO --------------------

app.post('/api/auth/register', async (req, res) => {
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
    const [usuarios] = await pool.execute(
      'SELECT id FROM usuarios WHERE username = ? OR email = ?',
      [username, email || '']
    );

    if (usuarios.length > 0) {
      return res.status(409).json({ ok: false, msg: 'Usuário ou email já existe' });
    }

    // TODO próximo marco: migrar autenticação para hash de senha e sessão/token.
    const [result] = await pool.execute(
      'INSERT INTO usuarios (username, senha, email) VALUES (?, ?, ?)',
      [username, password, email || null]
    );

    return res.json({
      ok: true,
      msg: 'Usuário registrado com sucesso',
      usuario: { id: result.insertId, username }
    });
  } catch (error) {
    console.error('Erro ao registrar:', error.message);
    return res.status(500).json({ ok: false, msg: 'Erro ao registrar usuário.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeText(req.body.username);
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).json({ ok: false, msg: 'Usuário e senha são obrigatórios' });
  }

  try {
    const [usuarios] = await pool.execute(
      'SELECT id, username, email FROM usuarios WHERE username = ? AND senha = ? LIMIT 1',
      [username, password]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Usuário ou senh inválidos' });
    }

    return res.json({ ok: true, msg: 'Login realizado com sucesso', usuario: usuarios[0] });
  } catch (error) {
    console.error('Erro ao fazer login:', error.message);
    return res.status(500).json({ ok: false, msg: 'Erro ao fazer login.' });
  }
});

// -------------------- VEICULOS SOLIDOS --------------------

app.get('/api/veiculos', async (req, res) => {
  const usuarioId = Number(req.query.usuarioId);
  if (!usuarioId) return res.status(400).json({ ok: false, msg: 'ID do usuário obrigatório.' });

  try {
    const [rows] = await pool.execute(
      `SELECT id, marca, modelo, ano, versao, criado_em
       FROM veiculos WHERE usuario_id = ? ORDER BY criado_em DESC`,
      [usuarioId]
    );
    return res.json({ ok: true, veiculos: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao carregar veículos.' });
  }
});

app.post('/api/veiculos', async (req, res) => {
  const usuarioId = Number(req.body.usuarioId);
  const marca = normalizeText(req.body.marca);
  const modelo = normalizeText(req.body.modelo);
  const ano = Number(req.body.ano);
  const versao = normalizeText(req.body.versao);

  if (!usuarioId || !marca || !modelo || !ano) {
    return res.status(400).json({ ok: false, msg: 'Usuário, marca, modelo e ano são obrigatórios.' });
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO veiculos (usuario_id, marca, modelo, ano, versao) VALUES (?, ?, ?, ?, ?)',
      [usuarioId, marca, modelo, ano, versao || null]
    );
    return res.json({ ok: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao salvar veículo.' });
  }
});

// ------------------- INTELIGÊNCIA ARTIFICIAL/TRIAGEM --------------------

app.post('/api/diagnostico/analisar', async (req, res) => {
  const usuarioId = Number(req.body.usuarioId) || null;
  const marca = normalizeText(req.body.marca);
  const modelo = normalizeText(req.body.modelo);
  const ano = Number(req.body.ano) || null;
  const versao = normalizeText(req.body.versao);
  const problema = normalizeText(req.body.problema);

  if (!marca || !modelo || !ano || problema.length < 5) {
    return res.status(400).json({
      ok: false,
      msg: 'Informe marca, modelo, ano e descreva o problema do veículo.'
    });
  }

  const veiculoTexto = `${marca} ${modelo} ${ano}${versao ? ` ${versao}` : ''}`;
  const cacheKey = `diag:${veiculoTexto.toLowerCase()}:${problema.toLowerCase()}`;
  const cached = cacheGet(cacheKey);

  if (cached) {
    if (usuarioId) await saveHistory(usuarioId, `${veiculoTexto} — {{problema}}`, 'problema');
    return res.json({ ok: true, ...cached, fonte: 'cache' });
  }

  const prompt = `Vê é um assistente do sistema Tech Peças IA.

Seu papel é ajedar leigos a organizar uma PESQUISA de peças automotivas, não fazer um diagnóstico mecânico definitivo.

Veículo: ${veiculoTexto}
Problema descrito pelo usuário: ${problema}

Analise o sintoma de forma cautelosa e identifique componentes possivelmente relacionados ao sintoma, para que depois o sistema procure peças compatíveis.

Retorne APENAS JSON válido nesta estrutura:
{
  "resumo": "explicação curta e simples do que pode estar relacionado ao sintoma",
  "orientacao": "orientação curta de segurança/manutenção, deixando claro que a confirmação deve ser feita por profissional quando necessário",
  "componentes": [
    {
      "nome": "nome do componente ou peça",
      "motivo": "por que pode ter relação com o sintoma",
      "termos_busca": ["termo principal", "sinônimo opcional"]
    }
  ]
}

Regras:
- Liste no máximo 6 componentes.
- Não invente códigos OEM.
- Não afirme que uma peça está defeituosa sem inspeção.
- Use linguagem simples em português do Brasil.
- Retorne somente JSON, sem markdown.`;

  try {
    const analise = await generateJsonWithGemini(prompt);
    const payload = {
      veiculo: { marca, modelo, ano, versao },
      problema,
      analise
    };
    cacheSet(cacheKey, payload);

    if (usuarioId) {
      await saveHistory(usuarioId, `${veiculoTexto} — ${problema}`, 'problema');
      try {
        await pool.execute(
          `INSERT INTO consultas_ia (usuario_id, veiculo_texto, problema, resposta)
           VALUES (?, ?, ?, ?)`,
          [usuarioId, veiculoTexto, problema, JSON.stringify(analise)]
        );
      } catch (error) {
        console.warn('Consulta de IA não foi persistida:', error.message);
      }
    }

    return res.json({ ok: true, ...payload, fonte: 'gemini' });
  } catch (error) {
    console.error('Erro no diagnóstico assistido:', error.message);
    const temporario = isTransientGeminiError(error);
    return res.status(temporario ? 503 : 500).json({
      ok: false,
      msg: temporario
        ? 'A Inteligência Artificial está com alta demanda no momento. Tente novamente em instantes.'
        : 'Não foi possível analisar o problema agora.',
      detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// -------------------- BUSCA DIRETA DE PEÇAS --------------------

app.post('/api/pecas/pesquisar', async (req, res) => {
  const usuarioId = Number(req.body.usuarioId) || null;
  const termo = normalizeText(req.body.termo);
  const marca = normalizeText(req.body.marca);
  const modelo = normalizeText(req.body.modelo);
  const ano = Number(req.body.ano) || null;

  if (termo.length < 2) {
    return res.status(400).json({ ok: false, msg: 'Digite o nome da peça que deseja procurar.' });
  }

  try {
    const like = `%${termo}%`;
    const params = [like, like, like];
    let compatClause = '';

    if (marca && modelo && ano) {
      compatClause = `
        AND EXISTS (
          SELECT 1 FROM compatibilidades c
          WHERE c.peca_id = p.id
            AND LOWER(c.marca) = LOWER(?)
            AND LOWER(c.modelo) = LOWER(?)
            AND ? BETWEEN c.ano_inicio AND c.ano_fim
        )`;
      params.push(marca, modelo, ano);
    }

    const [pecas] = await pool.execute(
      `SELECT
         p.id,
         p.nome,
         p.descricao,
         p.fabricante,
         p.categoria,
         p.preco_site,
         p.estoque,
         MIN(CASE WHEN o.disponivel = 1 THEN o.preco END) AS menor_preco_parceiro,
         COUNT(CASE WHEN o.disponivel = 1 THEN 1 END) AS total_ofertas
       FROM pecas p
       LEFT JOIN ofertas o ON o.peca_id = p.id
       WHERE (p.nome LIKE ? OR p.fabricante LIKE ? OR p.categoria LIKE ?)
       ${compatClause}
       GROUP BY p.id
       ORDER BY
         CASE WHEN p.estoque > 0 THEN 0 ELSE 1 END,
         COALESCE(p.preco_site, MIN(o.preco), 999999) ASC
       LIMIT 30`,
      params
    );

    if (usuarioId) await saveHistory(usuarioId, termo, 'peca');

    return res.json({
      ok: true,
      termo,
      filtros: marca && modelo && ano ? { marca, modelo, ano } : null,
      pecas: pecas.map((p) => ({
        ...p,
        preco_site: p.preco_site === null ? null : Number(p.preco_site),
        menor_preco_parceiro: p.menor_preco_parceiro === null ? null : Number(p.menor_preco_parceiro),
        total_ofertas: Number(p.total_ofertas || 0)
      }))
    });
  } catch (error) {
    console.error('Erro ao pesquisar peças:', error.message);
    return res.status(500).json({
      ok: false,
      msg: 'Erro ao pesquisar o catálogo. Verifique se o banco atualizado foi importado.'
    });
  }
});

app.get('/api/pecas/:id/ofertas', async (req, res) => {
  const pecaId = Number(req.params.id);
  if (!pecaId) return res.status(400).json({ ok: false, msg: 'Peça inválida.' });

  try {
    const [ofertas] = await pool.execute(
      `SELECT o.id, o.preco, o.link_compra, o.disponivel, o.atualizado_em,
              f.nome AS fornecedor, f.site
       FROM ofertas o
       INNER JOIN fornecedores f ON f.id = o.fornecedor_id
       WHERE o.peca_id = ? AND o.disponivel = 1
       ORDER BY o.preco ASC`,
      [pecaId]
    );
    return res.json({ ok: true, ofertas });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao carregar ofertas.' });
  }
});

// Endpoint antigo mantido temporariamente para não quebrar versões anteriores da tela.
app.post('/api/pecas/buscar', async (req, res) => {
  const carroNome = normalizeText(req.body.carroNome);
  if (!carroNome) return res.status(400).json({ ok: false, msg: 'Veículo obrigatório.' });

  return res.status(410).json({
    ok: false,
    msg: 'Esta busca foi substituída. Use a análise por problema ou a busca direta por peça.'
  });
});

// -------------------- HISTÓRICO --------------------

app.get('/api/historico', async (req, res) => {
  const usuarioId = Number(req.query.usuarioId);
  if (!usuarioId) return res.status(400).json({ ok: false, msg: 'ID do usuário é obrigatório' });

  try {
    let historico;
    try {
      [historico] = await pool.execute(
        `SELECT id, usuario_id, tipo, termo, data_busca
         FROM historico_buscas
         WHERE usuario_id = ?
         ORDER BY data_busca DESC LIMIT 30`,
        [usuarioId]
      );
    } catch (error) {
      if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;
      [historico] = await pool.execute(
        `SELECT id, usuario_id, 'busca' AS tipo, termo, data_busca
         FROM historico_buscas
         WHERE usuario_id = ?
         ORDER BY data_busca DESC LIMIT 30`,
        [usuarioId]
      );
    }
    return res.json({ ok: true, historico });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao obter histórico de buscas' });
  }
});

app.delete('/api/historico', async (req, res) => {
  const usuarioId = Number(req.body.usuarioId);
  if (!usuarioId) return res.status(400).json({ ok: false, msg: 'ID do usuário é obrigatório' });

  try {
    const [result] = await pool.execute(
      'DELETE FROM historico_buscas WHERE usuario_id = ?',
      [usuarioId]
    );
    return res.json({ ok: true, deletedRows: result.affectedRows });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Erro ao limpar histórico de buscas' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, projeto: 'Tech Peças IA', msg: 'Servidor rodando' });
});

app.listen(PORT, () => {
  console.log(`\n✅ Tech Peças IA rodando em ${API_BASE_URL}`);
  console.log('POST /api/diagnostico/analisar');
  console.log('POST /api/pecas/pesquisar');
  console.log('GET  /api/pecas/:id/ofertas');
  console.log('GET  /api/veiculos');
  console.log('POST /api/veiculos\n');
});
