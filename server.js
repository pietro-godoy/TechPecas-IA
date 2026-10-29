const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}/api`;
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

const aiCache = new Map();

function buildDbSslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined;

  const verifyCa = String(process.env.DB_SSL_VERIFY || '').trim().toLowerCase() === 'true';

  if (!verifyCa) {
    return { rejectUnauthorized: false };
  }

  const caPath = process.env.DB_CA_PATH
    ? path.resolve(__dirname, process.env.DB_CA_PATH)
    : path.join(__dirname, 'ca.pem');

  if (!fs.existsSync(caPath)) {
    throw new Error('DB_SSL_VERIFY=true, mas o certificado CA não foi encontrado.');
  }

  return {
    ca: fs.readFileSync(caPath),
    rejectUnauthorized: true
  };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'techpecas',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  ssl: buildDbSslOptions()
});

async function ensureColumn(table, column, definition) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );

  if (Number(rows[0]?.total || 0) > 0) return false;

  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  return true;
}

async function ensureStoreSchema() {
  const changes = [];

  if (await ensureColumn('pecas', 'imagem_url', 'VARCHAR(500) NULL')) {
    changes.push('pecas.imagem_url');
  }

  if (await ensureColumn('pecas', 'ativo', 'TINYINT(1) NOT NULL DEFAULT 1')) {
    changes.push('pecas.ativo');
  }

  if (await ensureColumn('pedidos', 'subtotal', 'DECIMAL(10,2) NOT NULL DEFAULT 0')) {
    changes.push('pedidos.subtotal');
  }

  if (await ensureColumn('pedidos', 'frete', 'DECIMAL(10,2) NOT NULL DEFAULT 0')) {
    changes.push('pedidos.frete');
  }

  if (await ensureColumn('pedidos', 'forma_pagamento', "VARCHAR(30) NOT NULL DEFAULT 'a_definir'")) {
    changes.push('pedidos.forma_pagamento');
  }

  if (await ensureColumn('pedidos', 'endereco_entrega', 'JSON NULL')) {
    changes.push('pedidos.endereco_entrega');
  }

  await pool.query(
    'UPDATE pedidos SET subtotal = valor_total WHERE subtotal = 0 AND valor_total > 0'
  );

  if (changes.length) {
    console.log('✅ Estrutura da loja atualizada:', changes.join(', '));
  } else {
    console.log('✅ Estrutura da loja já estava atualizada');
  }
}

pool.getConnection()
  .then(async (conn) => {
    console.log('✅ Conexão com banco de dados estabelecida');
    conn.release();

    try {
      await ensureStoreSchema();
    } catch (error) {
      console.error('❌ Erro ao atualizar estrutura da loja:', error.message);
    }
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

function buildExternalSearchQuery({ termo, marca, modelo, ano }) {
  return [termo, marca, modelo, ano, 'autopeça']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TechPecas/1.0'
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error || data?.message || ('HTTP ' + response.status);
      throw new Error(message);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchExternalProducts({ termo, marca, modelo, ano }) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return {
      configured: false,
      query: buildExternalSearchQuery({ termo, marca, modelo, ano }),
      products: []
    };
  }

  const query = buildExternalSearchQuery({ termo, marca, modelo, ano });
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: query,
    gl: 'br',
    hl: 'pt-br',
    google_domain: 'google.com.br',
    device: 'desktop',
    api_key: apiKey
  });

  const data = await fetchJsonWithTimeout('https://serpapi.com/search.json?' + params.toString());
  const rows = Array.isArray(data.shopping_results) ? data.shopping_results : [];

  const products = rows.slice(0, 12).map((item, index) => ({
    position: Number(item.position || index + 1),
    productId: item.product_id ? String(item.product_id) : null,
    pageToken: item.immersive_product_page_token || null,
    title: item.title || 'Produto',
    source: item.source || 'Loja externa',
    sourceIcon: item.source_icon || null,
    price: item.price || null,
    extractedPrice: Number.isFinite(Number(item.extracted_price)) ? Number(item.extracted_price) : null,
    oldPrice: item.old_price || null,
    rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
    reviews: Number.isFinite(Number(item.reviews)) ? Number(item.reviews) : null,
    delivery: item.delivery || null,
    snippet: item.snippet || null,
    thumbnail: item.thumbnail || item.serpapi_thumbnail || null,
    productLink: item.product_link || null,
    multipleSources: Boolean(item.multiple_sources),
    tag: item.tag || item.badge || null
  }));

  return {
    configured: true,
    query,
    products,
    provider: 'google_shopping'
  };
}

async function loadExternalProductStores({ productId, pageToken }) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return { configured: false, stores: [] };
  }

  if (!productId && !pageToken) {
    return { configured: true, stores: [] };
  }

  const params = new URLSearchParams({
    engine: 'google_product',
    gl: 'br',
    hl: 'pt-br',
    api_key: apiKey
  });

  if (pageToken) params.set('page_token', pageToken);
  else params.set('product_id', productId);

  const data = await fetchJsonWithTimeout('https://serpapi.com/search.json?' + params.toString());
  const product = data.product_results || {};
  const stores = Array.isArray(product.stores) ? product.stores : [];

  return {
    configured: true,
    title: product.title || null,
    priceRange: product.price_range || null,
    stores: stores.slice(0, 12).map((store, index) => ({
      position: Number(store.position || index + 1),
      name: store.name || 'Loja',
      logo: store.logo || null,
      link: store.link || null,
      title: store.title || null,
      rating: Number.isFinite(Number(store.rating)) ? Number(store.rating) : null,
      reviews: Number.isFinite(Number(store.reviews)) ? Number(store.reviews) : null,
      tag: store.tag || null,
      details: Array.isArray(store.details_and_offers) ? store.details_and_offers.slice(0, 3) : [],
      price: store.price || null,
      extractedPrice: Number.isFinite(Number(store.extracted_price)) ? Number(store.extracted_price) : null,
      originalPrice: store.original_price || null,
      shipping: store.shipping || null,
      total: store.total || null
    }))
  };
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
  if (Number.isFinite(directStatus) && directStatus > 0) return directStatus;

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

app.delete('/api/veiculos/:id', async (req, res) => {
  const veiculoId = Number(req.params.id);
  const usuarioId = Number(req.body.usuarioId);

  if (!veiculoId || !usuarioId) {
    return res.status(400).json({ ok: false, msg: 'Veículo e usuário são obrigatórios.' });
  }

  try {
    const [result] = await pool.execute(
      'DELETE FROM veiculos WHERE id = ? AND usuario_id = ?',
      [veiculoId, usuarioId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, msg: 'Veículo não encontrado.' });
    }

    return res.json({ ok: true, msg: 'Veículo removido da garagem.' });
  } catch (error) {
    console.error('Erro ao remover veículo:', error.message);
    return res.status(500).json({ ok: false, msg: 'Erro ao remover veículo.' });
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

  const prompt = `Você é um assistente interno do sistema Tech Peças.

Seu papel é ajudar pessoas a organizar uma PESQUISA de peças automotivas, não fazer um diagnóstico mecânico definitivo.

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
        ? 'O serviço de análise está temporariamente ocupado. Tente novamente em instantes.'
        : 'Não foi possível analisar o problema agora.',
      detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// -------------------- CATÁLOGO PRÓPRIO --------------------

app.get('/api/catalogo', async (req, res) => {
  const termo = normalizeText(req.query.termo);
  const categoria = normalizeText(req.query.categoria);
  const marca = normalizeText(req.query.marca);
  const modelo = normalizeText(req.query.modelo);
  const ano = Number(req.query.ano) || null;

  try {
    const where = ['p.ativo = 1'];
    const params = [];

    if (termo) {
      const like = '%' + termo + '%';
      where.push('(p.nome LIKE ? OR p.fabricante LIKE ? OR p.categoria LIKE ? OR p.sku LIKE ?)');
      params.push(like, like, like, like);
    }

    if (categoria) {
      where.push('LOWER(p.categoria) = LOWER(?)');
      params.push(categoria);
    }

    if (marca && modelo && ano) {
      where.push(`EXISTS (
        SELECT 1 FROM compatibilidades c
        WHERE c.peca_id = p.id
          AND LOWER(c.marca) = LOWER(?)
          AND LOWER(c.modelo) = LOWER(?)
          AND ? BETWEEN c.ano_inicio AND c.ano_fim
      )`);
      params.push(marca, modelo, ano);
    }

    const [rows] = await pool.execute(
      `SELECT p.id, p.nome, p.descricao, p.fabricante, p.categoria, p.sku,
              p.preco_site, p.estoque, p.imagem_url
       FROM pecas p
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN p.estoque > 0 THEN 0 ELSE 1 END,
                p.nome ASC
       LIMIT 100`,
      params
    );

    return res.json({
      ok: true,
      produtos: rows.map((p) => ({
        ...p,
        preco_site: p.preco_site === null ? null : Number(p.preco_site),
        estoque: Number(p.estoque || 0)
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
});

app.get('/api/catalogo/:id', async (req, res) => {
  const pecaId = Number(req.params.id);
  if (!pecaId) return res.status(400).json({ ok: false, msg: 'Produto inválido.' });

  try {
    const [rows] = await pool.execute(
      `SELECT id, nome, descricao, fabricante, categoria, sku,
              preco_site, estoque, imagem_url
       FROM pecas
       WHERE id = ? AND ativo = 1
       LIMIT 1`,
      [pecaId]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, msg: 'Produto não encontrado.' });
    }

    const [compatibilidades] = await pool.execute(
      `SELECT marca, modelo, ano_inicio, ano_fim, observacao
       FROM compatibilidades
       WHERE peca_id = ?
       ORDER BY marca, modelo, ano_inicio`,
      [pecaId]
    );

    const produto = rows[0];
    produto.preco_site = produto.preco_site === null ? null : Number(produto.preco_site);
    produto.estoque = Number(produto.estoque || 0);

    return res.json({ ok: true, produto, compatibilidades });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar o produto.' });
  }
});

// -------------------- PEDIDOS / CHECKOUT --------------------

app.post('/api/pedidos', async (req, res) => {
  const usuarioId = Number(req.body.usuarioId);
  const itensRecebidos = Array.isArray(req.body.itens) ? req.body.itens : [];
  const formaPagamento = normalizeText(req.body.formaPagamento).toLowerCase();
  const endereco = req.body.endereco && typeof req.body.endereco === 'object' ? req.body.endereco : {};

  const itens = itensRecebidos
    .map((item) => ({
      pecaId: Number(item.pecaId),
      quantidade: Math.max(1, Math.min(99, Number(item.quantidade) || 1))
    }))
    .filter((item) => item.pecaId);

  const pagamentoValido = ['pix', 'cartao'].includes(formaPagamento);
  const enderecoValido = endereco.cep && endereco.logradouro && endereco.numero &&
    endereco.cidade && endereco.estado;

  if (!usuarioId || !itens.length || !pagamentoValido || !enderecoValido) {
    return res.status(400).json({
      ok: false,
      msg: 'Usuário, itens, endereço e forma de pagamento são obrigatórios.'
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const ids = [...new Set(itens.map((item) => item.pecaId))];
    const placeholders = ids.map(() => '?').join(',');

    const [produtos] = await conn.query(
      `SELECT id, nome, preco_site, estoque, ativo
       FROM pecas
       WHERE id IN (${placeholders})
       FOR UPDATE`,
      ids
    );

    const mapa = new Map(produtos.map((produto) => [Number(produto.id), produto]));
    let subtotal = 0;

    const itensCalculados = itens.map((item) => {
      const produto = mapa.get(item.pecaId);

      if (!produto || Number(produto.ativo) !== 1 || produto.preco_site === null) {
        throw new Error('Produto indisponível: ' + item.pecaId);
      }

      if (Number(produto.estoque) < item.quantidade) {
        throw new Error('Estoque insuficiente para ' + produto.nome);
      }

      const preco = Number(produto.preco_site);
      subtotal += preco * item.quantidade;

      return {
        pecaId: item.pecaId,
        quantidade: item.quantidade,
        preco
      };
    });

    const frete = 0;
    const total = subtotal + frete;

    const [pedidoResult] = await conn.execute(
      `INSERT INTO pedidos
       (usuario_id, subtotal, frete, valor_total, forma_pagamento, endereco_entrega, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioId,
        subtotal.toFixed(2),
        frete.toFixed(2),
        total.toFixed(2),
        formaPagamento,
        JSON.stringify(endereco),
        'aguardando_pagamento'
      ]
    );

    const pedidoId = pedidoResult.insertId;

    for (const item of itensCalculados) {
      await conn.execute(
        `INSERT INTO itens_pedido (pedido_id, peca_id, quantidade, preco_unitario)
         VALUES (?, ?, ?, ?)`,
        [pedidoId, item.pecaId, item.quantidade, item.preco.toFixed(2)]
      );

      await conn.execute(
        'UPDATE pecas SET estoque = estoque - ? WHERE id = ?',
        [item.quantidade, item.pecaId]
      );
    }

    await conn.commit();

    return res.json({
      ok: true,
      pedido: {
        id: pedidoId,
        subtotal,
        frete,
        total,
        formaPagamento,
        status: 'aguardando_pagamento'
      }
    });
  } catch (error) {
    await conn.rollback();
    console.error('Erro ao criar pedido:', error.message);
    return res.status(400).json({
      ok: false,
      msg: error.message.startsWith('Estoque insuficiente') || error.message.startsWith('Produto indisponível')
        ? error.message
        : 'Não foi possível criar o pedido.'
    });
  } finally {
    conn.release();
  }
});

app.get('/api/pedidos', async (req, res) => {
  const usuarioId = Number(req.query.usuarioId);
  if (!usuarioId) return res.status(400).json({ ok: false, msg: 'Usuário obrigatório.' });

  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.subtotal, p.frete, p.valor_total, p.forma_pagamento,
              p.status, p.criado_em,
              COUNT(ip.id) AS total_itens,
              GROUP_CONCAT(CONCAT(pc.nome, ' x', ip.quantidade) SEPARATOR ' • ') AS resumo_itens
       FROM pedidos p
       LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
       LEFT JOIN pecas pc ON pc.id = ip.peca_id
       WHERE p.usuario_id = ?
       GROUP BY p.id
       ORDER BY p.criado_em DESC
       LIMIT 50`,
      [usuarioId]
    );

    return res.json({
      ok: true,
      pedidos: rows.map((p) => ({
        ...p,
        subtotal: Number(p.subtotal || 0),
        frete: Number(p.frete || 0),
        valor_total: Number(p.valor_total || 0),
        total_itens: Number(p.total_itens || 0)
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar seus pedidos.' });
  }
});

app.get('/api/pedidos/:id', async (req, res) => {
  const pedidoId = Number(req.params.id);
  const usuarioId = Number(req.query.usuarioId);

  if (!pedidoId || !usuarioId) {
    return res.status(400).json({ ok: false, msg: 'Pedido e usuário são obrigatórios.' });
  }

  try {
    const [pedidos] = await pool.execute(
      `SELECT id, usuario_id, subtotal, frete, valor_total, forma_pagamento,
              endereco_entrega, status, criado_em
       FROM pedidos
       WHERE id = ? AND usuario_id = ?
       LIMIT 1`,
      [pedidoId, usuarioId]
    );

    if (!pedidos.length) return res.status(404).json({ ok: false, msg: 'Pedido não encontrado.' });

    const [itens] = await pool.execute(
      `SELECT ip.peca_id, ip.quantidade, ip.preco_unitario,
              p.nome, p.fabricante, p.sku, p.imagem_url
       FROM itens_pedido ip
       INNER JOIN pecas p ON p.id = ip.peca_id
       WHERE ip.pedido_id = ?
       ORDER BY ip.id`,
      [pedidoId]
    );

    const pedido = pedidos[0];
    pedido.subtotal = Number(pedido.subtotal || 0);
    pedido.frete = Number(pedido.frete || 0);
    pedido.valor_total = Number(pedido.valor_total || 0);

    return res.json({
      ok: true,
      pedido,
      itens: itens.map((item) => ({
        ...item,
        preco_unitario: Number(item.preco_unitario || 0)
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar o pedido.' });
  }
});

// -------------------- OFERTAS EXTERNAS --------------------

app.post('/api/ofertas-externas/pesquisar', async (req, res) => {
  const termo = normalizeText(req.body.termo);
  const marca = normalizeText(req.body.marca);
  const modelo = normalizeText(req.body.modelo);
  const ano = Number(req.body.ano) || null;

  if (termo.length < 2) {
    return res.status(400).json({ ok: false, msg: 'Digite o nome da peça que deseja procurar.' });
  }

  try {
    const result = await searchExternalProducts({ termo, marca, modelo, ano });

    return res.json({
      ok: true,
      termo,
      filtros: marca && modelo && ano ? { marca, modelo, ano } : null,
      ...result
    });
  } catch (error) {
    console.error('Erro na busca externa:', error.message);
    return res.status(502).json({
      ok: false,
      configured: Boolean(process.env.SERPAPI_KEY),
      msg: 'Não foi possível consultar ofertas externas agora.',
      detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/ofertas-externas/lojas', async (req, res) => {
  const productId = normalizeText(req.body.productId);
  const pageToken = normalizeText(req.body.pageToken);

  if (!productId && !pageToken) {
    return res.status(400).json({ ok: false, msg: 'Produto externo inválido.' });
  }

  try {
    const result = await loadExternalProductStores({ productId, pageToken });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Erro ao carregar lojas externas:', error.message);
    return res.status(502).json({
      ok: false,
      configured: Boolean(process.env.SERPAPI_KEY),
      msg: 'Não foi possível carregar as lojas deste produto agora.',
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
  res.json({ ok: true, projeto: 'Tech Peças', msg: 'Servidor rodando' });
});

app.listen(PORT, () => {
  console.log(`\n✅ Tech Peças rodando em ${API_BASE_URL}`);
  console.log('POST /api/diagnostico/analisar');
  console.log('POST /api/pecas/pesquisar');
  console.log('GET  /api/pecas/:id/ofertas');
  console.log('GET  /api/veiculos');
  console.log('POST /api/veiculos\n');
});
