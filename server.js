const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

  if (await ensureColumn('usuarios', 'papel', "VARCHAR(20) NOT NULL DEFAULT 'cliente'")) {
    changes.push('usuarios.papel');
  }

  if (await ensureColumn('usuarios', 'asaas_customer_id', 'VARCHAR(100) NULL')) {
    changes.push('usuarios.asaas_customer_id');
  }

  if (await ensureColumn('pecas', 'imagem_url', 'VARCHAR(500) NULL')) {
    changes.push('pecas.imagem_url');
  }

  if (await ensureColumn('pecas', 'ativo', 'TINYINT(1) NOT NULL DEFAULT 1')) {
    changes.push('pecas.ativo');
  }

  if (await ensureColumn('pecas', 'auto_importado', 'TINYINT(1) NOT NULL DEFAULT 0')) {
    changes.push('pecas.auto_importado');
  }

  if (await ensureColumn('pecas', 'origem_tipo', "VARCHAR(30) NOT NULL DEFAULT 'proprio'")) {
    changes.push('pecas.origem_tipo');
  }

  if (await ensureColumn('pecas', 'origem_nome', 'VARCHAR(150) NULL')) {
    changes.push('pecas.origem_nome');
  }

  if (await ensureColumn('pecas', 'origem_url', 'VARCHAR(700) NULL')) {
    changes.push('pecas.origem_url');
  }

  if (await ensureColumn('pecas', 'preco_referencia', 'DECIMAL(10,2) NULL')) {
    changes.push('pecas.preco_referencia');
  }

  if (await ensureColumn('pecas', 'auto_import_term', 'VARCHAR(255) NULL')) {
    changes.push('pecas.auto_import_term');
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

  if (await ensureColumn('pedidos', 'asaas_payment_id', 'VARCHAR(100) NULL')) {
    changes.push('pedidos.asaas_payment_id');
  }

  if (await ensureColumn('pedidos', 'asaas_invoice_url', 'VARCHAR(500) NULL')) {
    changes.push('pedidos.asaas_invoice_url');
  }

  if (await ensureColumn('pedidos', 'asaas_status', 'VARCHAR(60) NULL')) {
    changes.push('pedidos.asaas_status');
  }

  if (await ensureColumn('pedidos', 'asaas_billing_type', 'VARCHAR(30) NULL')) {
    changes.push('pedidos.asaas_billing_type');
  }

  if (await ensureColumn('pedidos', 'estoque_devolvido', 'TINYINT(1) NOT NULL DEFAULT 0')) {
    changes.push('pedidos.estoque_devolvido');
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS asaas_webhook_eventos (
      event_id VARCHAR(120) PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      payment_id VARCHAR(100),
      recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await pool.query(
    'UPDATE pedidos SET subtotal = valor_total WHERE subtotal = 0 AND valor_total > 0'
  );

  await pool.query(
    'UPDATE pecas SET ativo = 1 WHERE auto_importado = 1'
  );

  await pool.query(
    `UPDATE pecas
     SET estoque = 8 + MOD(CRC32(COALESCE(sku, CONCAT('AUTO-', id))), 17)
     WHERE auto_importado = 1 AND estoque <= 0`
  );

  const adminUsername = String(process.env.ADMIN_USERNAME || '').trim();
  if (adminUsername) {
    await pool.execute(
      "UPDATE usuarios SET papel = 'admin' WHERE LOWER(username) = LOWER(?)",
      [adminUsername]
    );
  }

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

async function createSessionToken(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');

  await pool.execute(
    'DELETE FROM sessoes WHERE usuario_id = ? AND expira_em IS NOT NULL AND expira_em < NOW()',
    [usuarioId]
  );

  await pool.execute(
    'INSERT INTO sessoes (id, usuario_id, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
    [token, usuarioId]
  );

  return token;
}

async function requireAdmin(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ ok: false, msg: 'Faça login para acessar o painel administrativo.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.email, u.papel
       FROM sessoes s
       INNER JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id = ?
         AND (s.expira_em IS NULL OR s.expira_em > NOW())
         AND u.papel = 'admin'
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return res.status(403).json({ ok: false, msg: 'Acesso permitido somente para administrador.' });
    }

    req.admin = rows[0];
    next();
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível validar o acesso administrativo.' });
  }
}

async function requireUser(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ ok: false, msg: 'Faça login para continuar.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.email, u.papel, u.asaas_customer_id
       FROM sessoes s
       INNER JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id = ?
         AND (s.expira_em IS NULL OR s.expira_em > NOW())
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, msg: 'Sua sessão expirou. Entre novamente.' });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível validar sua sessão.' });
  }
}

function getAsaasBaseUrl() {
  const configured = normalizeText(process.env.ASAAS_BASE_URL);
  if (configured) return configured.replace(/\/$/, '');

  return String(process.env.ASAAS_ENV || 'sandbox').toLowerCase() === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

function asaasConfigured() {
  return Boolean(normalizeText(process.env.ASAAS_API_KEY));
}

async function asaasRequest(endpoint, options = {}) {
  const apiKey = normalizeText(process.env.ASAAS_API_KEY);
  if (!apiKey) {
    const error = new Error('Integração Asaas ainda não configurada no servidor.');
    error.code = 'ASAAS_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout || 30000));

  try {
    const response = await fetch(getAsaasBaseUrl() + endpoint, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'TechPecas/1.0',
        access_token: apiKey
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const descriptions = Array.isArray(data.errors)
        ? data.errors.map((item) => item.description || item.code).filter(Boolean)
        : [];
      const message = descriptions.join(' | ') || data.message || ('Asaas HTTP ' + response.status);
      const error = new Error(message);
      error.status = response.status;
      error.asaas = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function paymentDueDate(days = 1) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getOrCreateAsaasCustomer(user, payer, address) {
  if (user.asaas_customer_id) return user.asaas_customer_id;

  const cpfCnpj = onlyDigits(payer.cpfCnpj);
  const name = normalizeText(payer.name);

  if (!name || ![11, 14].includes(cpfCnpj.length)) {
    const error = new Error('Informe nome completo e um CPF/CNPJ válido para gerar a cobrança.');
    error.code = 'INVALID_PAYER';
    throw error;
  }

  const customer = await asaasRequest('/customers', {
    method: 'POST',
    body: {
      name,
      cpfCnpj,
      email: normalizeText(payer.email) || undefined,
      mobilePhone: onlyDigits(payer.mobilePhone) || undefined,
      postalCode: onlyDigits(address.cep) || undefined,
      address: normalizeText(address.logradouro) || undefined,
      addressNumber: normalizeText(address.numero) || undefined,
      complement: normalizeText(address.complemento) || undefined,
      externalReference: 'techpecas-user-' + user.id,
      notificationDisabled: true
    }
  });

  if (!customer.id) {
    throw new Error('O Asaas não retornou o identificador do cliente.');
  }

  await pool.execute(
    'UPDATE usuarios SET asaas_customer_id = ? WHERE id = ?',
    [customer.id, user.id]
  );

  user.asaas_customer_id = customer.id;
  return customer.id;
}

function mapAsaasEventToOrderStatus(event) {
  if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) return 'pago';

  if (event === 'PAYMENT_AWAITING_RISK_ANALYSIS') return 'analise_risco';
  if (event === 'PAYMENT_APPROVED_BY_RISK_ANALYSIS') return 'aguardando_pagamento';

  if ([
    'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
    'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
    'PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED'
  ].includes(event)) return 'pagamento_recusado';

  if (event === 'PAYMENT_OVERDUE') return 'vencido';
  if (event === 'PAYMENT_DELETED') return 'cancelado';
  if (event === 'PAYMENT_RESTORED') return 'aguardando_pagamento';

  if (event === 'PAYMENT_REFUND_IN_PROGRESS') return 'estorno_em_processamento';
  if (event === 'PAYMENT_PARTIALLY_REFUNDED') return 'estornado_parcial';
  if (event === 'PAYMENT_REFUNDED') return 'estornado';

  if (event === 'PAYMENT_CHARGEBACK_REQUESTED') return 'chargeback';
  if (event === 'PAYMENT_CHARGEBACK_DISPUTE') return 'chargeback_em_disputa';
  if (event === 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL') return 'chargeback_em_reversao';

  return null;
}

function shouldReleaseReservedStock(status) {
  return ['pagamento_recusado', 'vencido', 'cancelado'].includes(status);
}

async function releaseOrderStock(conn, pedidoId) {
  const [[pedido]] = await conn.execute(
    'SELECT estoque_devolvido FROM pedidos WHERE id = ? FOR UPDATE',
    [pedidoId]
  );

  if (!pedido || Number(pedido.estoque_devolvido) === 1) return false;

  const [itens] = await conn.execute(
    `SELECT ip.peca_id, ip.quantidade, p.auto_importado
     FROM itens_pedido ip
     INNER JOIN pecas p ON p.id = ip.peca_id
     WHERE ip.pedido_id = ?`,
    [pedidoId]
  );

  for (const item of itens) {
    await conn.execute(
      'UPDATE pecas SET estoque = estoque + ? WHERE id = ?',
      [Number(item.quantidade), Number(item.peca_id)]
    );
  }

  await conn.execute(
    'UPDATE pedidos SET estoque_devolvido = 1 WHERE id = ?',
    [pedidoId]
  );

  return true;
}

async function reserveOrderStockAgain(conn, pedidoId) {
  const [[pedido]] = await conn.execute(
    'SELECT estoque_devolvido FROM pedidos WHERE id = ? FOR UPDATE',
    [pedidoId]
  );

  if (!pedido) throw new Error('Pedido não encontrado.');
  if (Number(pedido.estoque_devolvido) === 0) return true;

  const [itens] = await conn.execute(
    `SELECT ip.peca_id, ip.quantidade, p.nome, p.estoque, p.ativo, p.auto_importado
     FROM itens_pedido ip
     INNER JOIN pecas p ON p.id = ip.peca_id
     WHERE ip.pedido_id = ?
     FOR UPDATE`,
    [pedidoId]
  );

  for (const item of itens) {
    if (Number(item.ativo) !== 1 || Number(item.estoque) < Number(item.quantidade)) {
      return false;
    }
  }

  for (const item of itens) {
    await conn.execute(
      'UPDATE pecas SET estoque = estoque - ? WHERE id = ?',
      [Number(item.quantidade), Number(item.peca_id)]
    );
  }

  await conn.execute(
    'UPDATE pedidos SET estoque_devolvido = 0 WHERE id = ?',
    [pedidoId]
  );

  return true;
}

async function reconcileLatePaidStock(conn, pedidoId) {
  const [[pedido]] = await conn.execute(
    'SELECT estoque_devolvido FROM pedidos WHERE id = ? FOR UPDATE',
    [pedidoId]
  );

  if (!pedido || Number(pedido.estoque_devolvido) === 0) {
    return { ok: true, status: 'pago' };
  }

  const reserved = await reserveOrderStockAgain(conn, pedidoId);
  return reserved
    ? { ok: true, status: 'pago' }
    : { ok: false, status: 'pago_revisar_estoque' };
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
      total: store.total || null,
      extractedTotal: Number.isFinite(Number(store.extracted_total)) ? Number(store.extracted_total) : null,
      installmentsDescription: store.installments_description || null,
      monthlyPaymentDuration: Number.isFinite(Number(store.monthly_payment_duration)) ? Number(store.monthly_payment_duration) : null,
      downPayment: store.down_payment || null
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
      usuario: {
        id: result.insertId,
        username,
        email: email || '',
        papel: 'cliente',
        token: await createSessionToken(result.insertId)
      }
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
      'SELECT id, username, email, papel FROM usuarios WHERE username = ? AND senha = ? LIMIT 1',
      [username, password]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Usuário ou senh inválidos' });
    }

    const usuario = usuarios[0];
    usuario.token = await createSessionToken(usuario.id);

    return res.json({ ok: true, msg: 'Login realizado com sucesso', usuario });
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

// -------------------- ADMINISTRAÇÃO --------------------

app.get('/api/admin/me', requireAdmin, async (req, res) => {
  return res.json({ ok: true, admin: req.admin });
});

app.get('/api/admin/resumo', requireAdmin, async (req, res) => {
  try {
    const [[produtos]] = await pool.query(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos, SUM(CASE WHEN estoque <= 3 AND ativo = 1 THEN 1 ELSE 0 END) AS estoque_baixo FROM pecas'
    );
    const [[pedidos]] = await pool.query(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'aguardando_pagamento' THEN 1 ELSE 0 END) AS aguardando, COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN valor_total ELSE 0 END), 0) AS valor_total FROM pedidos"
    );
    const [[usuarios]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');

    return res.json({
      ok: true,
      resumo: {
        produtos: Number(produtos.total || 0),
        produtosAtivos: Number(produtos.ativos || 0),
        estoqueBaixo: Number(produtos.estoque_baixo || 0),
        pedidos: Number(pedidos.total || 0),
        aguardandoPagamento: Number(pedidos.aguardando || 0),
        valorPedidos: Number(pedidos.valor_total || 0),
        usuarios: Number(usuarios.total || 0)
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar o resumo administrativo.' });
  }
});

app.get('/api/admin/produtos', requireAdmin, async (req, res) => {
  try {
    const [produtos] = await pool.query(
      `SELECT p.id, p.nome, p.descricao, p.fabricante, p.categoria, p.sku,
              p.preco_site, p.estoque, p.imagem_url, p.ativo, p.criado_em,
              p.auto_importado, p.origem_tipo, p.origem_nome, p.origem_url,
              p.preco_referencia, p.auto_import_term,
              COUNT(c.id) AS total_compatibilidades
       FROM pecas p
       LEFT JOIN compatibilidades c ON c.peca_id = p.id
       GROUP BY p.id
       ORDER BY p.criado_em DESC, p.id DESC`
    );

    return res.json({
      ok: true,
      produtos: produtos.map((p) => ({
        ...p,
        preco_site: p.preco_site === null ? null : Number(p.preco_site),
        estoque: Number(p.estoque || 0),
        ativo: Number(p.ativo || 0),
        total_compatibilidades: Number(p.total_compatibilidades || 0)
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar os produtos.' });
  }
});

app.get('/api/admin/produtos/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, msg: 'Produto inválido.' });

  try {
    const [rows] = await pool.execute(
      `SELECT id, nome, descricao, fabricante, categoria, sku,
              preco_site, estoque, imagem_url, ativo,
              auto_importado, origem_tipo, origem_nome, origem_url,
              preco_referencia, auto_import_term
       FROM pecas WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Produto não encontrado.' });

    const [compatibilidades] = await pool.execute(
      `SELECT id, marca, modelo, ano_inicio, ano_fim, observacao
       FROM compatibilidades
       WHERE peca_id = ?
       ORDER BY marca, modelo, ano_inicio`,
      [id]
    );

    const produto = rows[0];
    produto.preco_site = produto.preco_site === null ? null : Number(produto.preco_site);
    produto.estoque = Number(produto.estoque || 0);
    produto.ativo = Number(produto.ativo || 0);

    return res.json({ ok: true, produto, compatibilidades });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar o produto.' });
  }
});

function normalizeAdminProduct(body) {
  const precoRaw = body.preco_site;
  const compatibilidades = Array.isArray(body.compatibilidades) ? body.compatibilidades : [];

  return {
    nome: normalizeText(body.nome),
    descricao: normalizeText(body.descricao),
    fabricante: normalizeText(body.fabricante),
    categoria: normalizeText(body.categoria),
    sku: normalizeText(body.sku),
    preco: precoRaw === '' || precoRaw === null || precoRaw === undefined ? null : Number(precoRaw),
    estoque: Math.max(0, Number(body.estoque) || 0),
    imagemUrl: normalizeText(body.imagem_url),
    ativo: Number(body.ativo) === 0 ? 0 : 1,
    compatibilidades: compatibilidades
      .map((c) => ({
        marca: normalizeText(c.marca),
        modelo: normalizeText(c.modelo),
        ano_inicio: Number(c.ano_inicio),
        ano_fim: Number(c.ano_fim),
        observacao: normalizeText(c.observacao)
      }))
      .filter((c) => c.marca && c.modelo && c.ano_inicio && c.ano_fim)
  };
}

async function replaceCompatibilities(conn, pecaId, compatibilidades) {
  await conn.execute('DELETE FROM compatibilidades WHERE peca_id = ?', [pecaId]);

  for (const c of compatibilidades) {
    if (c.ano_fim < c.ano_inicio) {
      throw new Error('Ano final da compatibilidade não pode ser menor que o ano inicial.');
    }

    await conn.execute(
      `INSERT INTO compatibilidades
       (peca_id, marca, modelo, ano_inicio, ano_fim, observacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pecaId, c.marca, c.modelo, c.ano_inicio, c.ano_fim, c.observacao || null]
    );
  }
}

app.post('/api/admin/produtos', requireAdmin, async (req, res) => {
  const produto = normalizeAdminProduct(req.body);

  if (!produto.nome || !produto.sku) {
    return res.status(400).json({ ok: false, msg: 'Nome e SKU são obrigatórios.' });
  }

  if (produto.preco !== null && (!Number.isFinite(produto.preco) || produto.preco < 0)) {
    return res.status(400).json({ ok: false, msg: 'Preço inválido.' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO pecas
       (nome, descricao, fabricante, categoria, sku, preco_site, estoque, imagem_url, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        produto.nome,
        produto.descricao || null,
        produto.fabricante || null,
        produto.categoria || null,
        produto.sku,
        produto.preco,
        produto.estoque,
        produto.imagemUrl || null,
        produto.ativo
      ]
    );

    await replaceCompatibilities(conn, result.insertId, produto.compatibilidades);
    await conn.commit();

    return res.json({ ok: true, id: result.insertId, msg: 'Produto cadastrado com sucesso.' });
  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, msg: 'Já existe um produto com esse SKU.' });
    }
    return res.status(400).json({ ok: false, msg: error.message || 'Não foi possível cadastrar o produto.' });
  } finally {
    conn.release();
  }
});

app.put('/api/admin/produtos/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const produto = normalizeAdminProduct(req.body);

  if (!id || !produto.nome || !produto.sku) {
    return res.status(400).json({ ok: false, msg: 'Produto, nome e SKU são obrigatórios.' });
  }

  if (produto.preco !== null && (!Number.isFinite(produto.preco) || produto.preco < 0)) {
    return res.status(400).json({ ok: false, msg: 'Preço inválido.' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `UPDATE pecas
       SET nome = ?, descricao = ?, fabricante = ?, categoria = ?, sku = ?,
           preco_site = ?, estoque = ?, imagem_url = ?, ativo = ?
       WHERE id = ?`,
      [
        produto.nome,
        produto.descricao || null,
        produto.fabricante || null,
        produto.categoria || null,
        produto.sku,
        produto.preco,
        produto.estoque,
        produto.imagemUrl || null,
        produto.ativo,
        id
      ]
    );

    if (!result.affectedRows) throw new Error('Produto não encontrado.');

    await replaceCompatibilities(conn, id, produto.compatibilidades);
    await conn.commit();

    return res.json({ ok: true, msg: 'Produto atualizado com sucesso.' });
  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, msg: 'Já existe outro produto com esse SKU.' });
    }
    return res.status(400).json({ ok: false, msg: error.message || 'Não foi possível atualizar o produto.' });
  } finally {
    conn.release();
  }
});

app.patch('/api/admin/produtos/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const ativo = Number(req.body.ativo) === 1 ? 1 : 0;

  if (!id) return res.status(400).json({ ok: false, msg: 'Produto inválido.' });

  try {
    const [result] = await pool.execute('UPDATE pecas SET ativo = ? WHERE id = ?', [ativo, id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Produto não encontrado.' });
    return res.json({ ok: true, msg: ativo ? 'Produto ativado.' : 'Produto desativado.' });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível alterar o status do produto.' });
  }
});

app.delete('/api/admin/produtos/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, msg: 'Produto inválido.' });

  try {
    const [[refs]] = await pool.execute(
      'SELECT COUNT(*) AS total FROM itens_pedido WHERE peca_id = ?',
      [id]
    );

    if (Number(refs.total || 0) > 0) {
      return res.status(409).json({
        ok: false,
        msg: 'Este produto já faz parte de pedidos. Desative-o em vez de excluir.'
      });
    }

    const [result] = await pool.execute('DELETE FROM pecas WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Produto não encontrado.' });

    return res.json({ ok: true, msg: 'Produto excluído.' });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível excluir o produto.' });
  }
});

app.get('/api/admin/pedidos', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.valor_total, p.forma_pagamento, p.status, p.criado_em,
              u.username, u.email,
              COUNT(ip.id) AS total_itens
       FROM pedidos p
       INNER JOIN usuarios u ON u.id = p.usuario_id
       LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
       GROUP BY p.id
       ORDER BY p.criado_em DESC
       LIMIT 100`
    );

    return res.json({
      ok: true,
      pedidos: rows.map((p) => ({
        ...p,
        valor_total: Number(p.valor_total || 0),
        total_itens: Number(p.total_itens || 0)
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar os pedidos.' });
  }
});

app.patch('/api/admin/pedidos/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = normalizeText(req.body.status);
  const permitidos = [
    'aguardando_pagamento',
    'analise_risco',
    'pagamento_recusado',
    'vencido',
    'pago',
    'pago_revisar_estoque',
    'preparando',
    'enviado',
    'concluido',
    'cancelado',
    'estorno_em_processamento',
    'estornado_parcial',
    'estornado',
    'chargeback',
    'chargeback_em_disputa',
    'chargeback_em_reversao'
  ];

  if (!id || !permitidos.includes(status)) {
    return res.status(400).json({ ok: false, msg: 'Pedido ou status inválido.' });
  }

  try {
    const [result] = await pool.execute('UPDATE pedidos SET status = ? WHERE id = ?', [status, id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Pedido não encontrado.' });
    return res.json({ ok: true, msg: 'Status do pedido atualizado.' });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível atualizar o pedido.' });
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
              p.preco_site, p.estoque, p.imagem_url, p.auto_importado
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
});

app.get('/api/catalogo/:id', async (req, res) => {
  const pecaId = Number(req.params.id);
  if (!pecaId) return res.status(400).json({ ok: false, msg: 'Produto inválido.' });

  try {
    const [rows] = await pool.execute(
      `SELECT id, nome, descricao, fabricante, categoria, sku,
              preco_site, estoque, imagem_url, auto_importado
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
    produto.auto_importado = Number(produto.auto_importado || 0);

    return res.json({ ok: true, produto, compatibilidades });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível carregar o produto.' });
  }
});

// -------------------- ASAAS / PAGAMENTOS --------------------

app.get('/api/pagamentos/asaas/status', (req, res) => {
  return res.json({
    ok: true,
    configured: asaasConfigured(),
    environment: String(process.env.ASAAS_ENV || 'sandbox').toLowerCase()
  });
});

app.post('/api/pagamentos/asaas/criar', requireUser, async (req, res) => {
  const pedidoId = Number(req.body.pedidoId);
  const payer = req.body.pagador && typeof req.body.pagador === 'object' ? req.body.pagador : {};

  if (!pedidoId) {
    return res.status(400).json({ ok: false, msg: 'Pedido inválido.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, usuario_id, valor_total, forma_pagamento, endereco_entrega, status,
              asaas_payment_id, asaas_invoice_url, asaas_status, asaas_billing_type,
              estoque_devolvido
       FROM pedidos
       WHERE id = ? AND usuario_id = ?
       LIMIT 1`,
      [pedidoId, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, msg: 'Pedido não encontrado.' });
    }

    const pedido = rows[0];
    const endereco = typeof pedido.endereco_entrega === 'string'
      ? JSON.parse(pedido.endereco_entrega || '{}')
      : (pedido.endereco_entrega || {});

    const retryableStatuses = ['pagamento_recusado', 'vencido', 'cancelado'];
    const shouldRetry = pedido.asaas_payment_id && retryableStatuses.includes(pedido.status);

    if (pedido.asaas_payment_id && !shouldRetry) {
      const response = {
        ok: true,
        pedidoId,
        paymentId: pedido.asaas_payment_id,
        billingType: pedido.asaas_billing_type,
        status: pedido.asaas_status,
        orderStatus: pedido.status,
        invoiceUrl: pedido.asaas_invoice_url || null
      };

      if (pedido.asaas_billing_type === 'PIX') {
        try {
          const qr = await asaasRequest('/payments/' + encodeURIComponent(pedido.asaas_payment_id) + '/pixQrCode');
          response.pix = {
            encodedImage: qr.encodedImage || null,
            payload: qr.payload || null,
            expirationDate: qr.expirationDate || null
          };
        } catch (error) {
          console.warn('Não foi possível recuperar QR Pix existente:', error.message);
        }
      }

      return res.json(response);
    }

    if (shouldRetry) {
      const retryConn = await pool.getConnection();

      try {
        await retryConn.beginTransaction();
        const stockAvailable = await reserveOrderStockAgain(retryConn, pedidoId);

        if (!stockAvailable) {
          await retryConn.rollback();
          return res.status(409).json({
            ok: false,
            code: 'STOCK_CHANGED',
            msg: 'O pagamento anterior não foi concluído e o estoque mudou. Revise o pedido antes de tentar novamente.'
          });
        }

        await retryConn.execute(
          `UPDATE pedidos
           SET status = 'aguardando_pagamento',
               asaas_payment_id = NULL,
               asaas_invoice_url = NULL,
               asaas_status = NULL,
               asaas_billing_type = NULL
           WHERE id = ?`,
          [pedidoId]
        );

        await retryConn.commit();
        pedido.asaas_payment_id = null;
        pedido.asaas_invoice_url = null;
        pedido.asaas_status = null;
        pedido.asaas_billing_type = null;
        pedido.status = 'aguardando_pagamento';
        pedido.estoque_devolvido = 0;
      } catch (error) {
        await retryConn.rollback();
        throw error;
      } finally {
        retryConn.release();
      }
    }

    const customerId = await getOrCreateAsaasCustomer(req.user, payer, endereco);
    const billingType = pedido.forma_pagamento === 'cartao' ? 'CREDIT_CARD' : 'PIX';

    const payment = await asaasRequest('/payments', {
      method: 'POST',
      timeout: billingType === 'CREDIT_CARD' ? 60000 : 30000,
      body: {
        customer: customerId,
        billingType,
        value: Number(pedido.valor_total),
        dueDate: paymentDueDate(1),
        description: 'Pedido #' + pedidoId + ' - Tech Pecas',
        externalReference: String(pedidoId)
      }
    });

    await pool.execute(
      `UPDATE pedidos
       SET asaas_payment_id = ?,
           asaas_invoice_url = ?,
           asaas_status = ?,
           asaas_billing_type = ?
       WHERE id = ?`,
      [
        payment.id || null,
        payment.invoiceUrl || null,
        payment.status || null,
        billingType,
        pedidoId
      ]
    );

    const response = {
      ok: true,
      pedidoId,
      paymentId: payment.id || null,
      billingType,
      status: payment.status || null,
      invoiceUrl: payment.invoiceUrl || null
    };

    if (billingType === 'PIX' && payment.id) {
      const qr = await asaasRequest('/payments/' + encodeURIComponent(payment.id) + '/pixQrCode');
      response.pix = {
        encodedImage: qr.encodedImage || null,
        payload: qr.payload || null,
        expirationDate: qr.expirationDate || null
      };
    }

    return res.json(response);
  } catch (error) {
    console.error('Erro Asaas ao criar cobrança:', error.message);
    return res.status(error.status && error.status < 500 ? error.status : 502).json({
      ok: false,
      msg: error.message || 'Não foi possível gerar o pagamento no Asaas.'
    });
  }
});

app.get('/api/pagamentos/asaas/pedido/:id', requireUser, async (req, res) => {
  const pedidoId = Number(req.params.id);
  if (!pedidoId) return res.status(400).json({ ok: false, msg: 'Pedido inválido.' });

  try {
    const [rows] = await pool.execute(
      `SELECT id, status, asaas_status, asaas_payment_id, asaas_invoice_url, asaas_billing_type
       FROM pedidos
       WHERE id = ? AND usuario_id = ?
       LIMIT 1`,
      [pedidoId, req.user.id]
    );

    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Pedido não encontrado.' });

    return res.json({ ok: true, pedido: rows[0] });
  } catch (error) {
    return res.status(500).json({ ok: false, msg: 'Não foi possível consultar o pagamento.' });
  }
});

app.post('/api/webhooks/asaas', async (req, res) => {
  const configuredToken = normalizeText(process.env.ASAAS_WEBHOOK_TOKEN);
  const receivedToken = normalizeText(req.headers['asaas-access-token']);

  if (!configuredToken) {
    return res.status(503).json({ ok: false, msg: 'Webhook Asaas não configurado.' });
  }

  if (!receivedToken || receivedToken !== configuredToken) {
    return res.status(401).json({ ok: false, msg: 'Token de Webhook inválido.' });
  }

  const eventId = normalizeText(req.body.id);
  const event = normalizeText(req.body.event);
  const payment = req.body.payment && typeof req.body.payment === 'object' ? req.body.payment : {};
  const paymentId = normalizeText(payment.id);
  const externalReference = Number(payment.externalReference) || null;

  if (!eventId || !event) {
    return res.status(400).json({ ok: false, msg: 'Evento inválido.' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [insert] = await conn.execute(
      `INSERT IGNORE INTO asaas_webhook_eventos (event_id, event_type, payment_id)
       VALUES (?, ?, ?)`,
      [eventId, event, paymentId || null]
    );

    if (!insert.affectedRows) {
      await conn.commit();
      return res.json({ ok: true, duplicate: true });
    }

    let pedido = null;

    if (paymentId || externalReference) {
      const where = [];
      const params = [];

      if (paymentId) {
        where.push('asaas_payment_id = ?');
        params.push(paymentId);
      }

      if (externalReference) {
        where.push('id = ?');
        params.push(externalReference);
      }

      const [rows] = await conn.execute(
        `SELECT id, status, estoque_devolvido
         FROM pedidos
         WHERE ${where.join(' OR ')}
         LIMIT 1
         FOR UPDATE`,
        params
      );

      pedido = rows[0] || null;
    }

    if (pedido) {
      let localStatus = mapAsaasEventToOrderStatus(event);
      const asaasStatus = normalizeText(payment.status) || event;

      if (localStatus === 'pago') {
        const reconciled = await reconcileLatePaidStock(conn, pedido.id);
        localStatus = reconciled.status;
      } else if (localStatus && shouldReleaseReservedStock(localStatus)) {
        await releaseOrderStock(conn, pedido.id);
      }

      const sets = ['asaas_status = ?'];
      const setParams = [asaasStatus];

      if (localStatus) {
        sets.push('status = ?');
        setParams.push(localStatus);
      }

      await conn.execute(
        `UPDATE pedidos SET ${sets.join(', ')} WHERE id = ?`,
        [...setParams, pedido.id]
      );
    }

    await conn.commit();
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    console.error('Erro ao processar Webhook Asaas:', error.message);
    return res.status(500).json({ ok: false, msg: 'Erro ao processar Webhook.' });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/asaas/webhook', requireAdmin, async (req, res) => {
  if (!asaasConfigured()) {
    return res.status(400).json({ ok: false, msg: 'ASAAS_API_KEY ainda não foi configurada.' });
  }

  const publicUrl = normalizeText(process.env.APP_PUBLIC_URL).replace(/\/$/, '');
  const email = normalizeText(process.env.ASAAS_WEBHOOK_EMAIL);
  const authToken = normalizeText(process.env.ASAAS_WEBHOOK_TOKEN);

  if (!publicUrl || !email || authToken.length < 32) {
    return res.status(400).json({
      ok: false,
      msg: 'Configure APP_PUBLIC_URL, ASAAS_WEBHOOK_EMAIL e ASAAS_WEBHOOK_TOKEN (mínimo 32 caracteres).'
    });
  }

  const events = [
    'PAYMENT_CREATED',
    'PAYMENT_UPDATED',
    'PAYMENT_CONFIRMED',
    'PAYMENT_RECEIVED',
    'PAYMENT_OVERDUE',
    'PAYMENT_DELETED',
    'PAYMENT_RESTORED',
    'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
    'PAYMENT_AWAITING_RISK_ANALYSIS',
    'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
    'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
    'PAYMENT_CREDIT_CARD_THREE_D_SECURE_CHALLENGE_FAILED',
    'PAYMENT_REFUND_IN_PROGRESS',
    'PAYMENT_REFUNDED',
    'PAYMENT_PARTIALLY_REFUNDED',
    'PAYMENT_CHARGEBACK_REQUESTED',
    'PAYMENT_CHARGEBACK_DISPUTE',
    'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
  ];

  try {
    const webhookUrl = publicUrl + '/api/webhooks/asaas';
    const list = await asaasRequest('/webhooks?limit=100');
    const existing = Array.isArray(list.data)
      ? list.data.find((item) => item.url === webhookUrl)
      : null;

    const payload = {
      name: 'Tech Pecas - Pagamentos',
      url: webhookUrl,
      email,
      interrupted: false,
      enabled: true,
      authToken,
      events,
      sendType: 'SEQUENTIALLY'
    };

    if (existing?.id) {
      const webhook = await asaasRequest('/webhooks/' + encodeURIComponent(existing.id), {
        method: 'PUT',
        body: payload
      });

      return res.json({ ok: true, created: false, updated: true, webhook });
    }

    const webhook = await asaasRequest('/webhooks', {
      method: 'POST',
      body: {
        ...payload,
        apiVersion: 3
      }
    });

    return res.json({ ok: true, created: true, updated: false, webhook });
  } catch (error) {
    console.error('Erro ao configurar Webhook Asaas:', error.message);
    return res.status(error.status && error.status < 500 ? error.status : 502).json({
      ok: false,
      msg: error.message || 'Não foi possível configurar o Webhook no Asaas.'
    });
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
      `SELECT id, nome, preco_site, estoque, ativo, auto_importado
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

async function hasActiveCatalogMatch({ termo, marca, modelo, ano }) {
  const like = '%' + termo + '%';
  const params = [like, like, like];
  let compatibility = '';

  if (marca && modelo && ano) {
    compatibility = `
      AND EXISTS (
        SELECT 1 FROM compatibilidades c
        WHERE c.peca_id = p.id
          AND LOWER(c.marca) = LOWER(?)
          AND LOWER(c.modelo) = LOWER(?)
          AND ? BETWEEN c.ano_inicio AND c.ano_fim
      )`;
    params.push(marca, modelo, ano);
  }

  const [rows] = await pool.execute(
    `SELECT p.id
     FROM pecas p
     WHERE p.ativo = 1
       AND (p.nome LIKE ? OR p.fabricante LIKE ? OR p.categoria LIKE ?)
       ${compatibility}
     LIMIT 1`,
    params
  );

  return rows.length > 0;
}

function externalDraftSku(product) {
  const source = [
    product.productId || '',
    product.title || '',
    product.source || '',
    product.productLink || ''
  ].join('|');

  return 'EXT-' + crypto.createHash('sha1').update(source).digest('hex').slice(0, 12).toUpperCase();
}

async function autoImportExternalDrafts({ termo, marca, modelo, ano, products }) {
  const candidates = (Array.isArray(products) ? products : [])
    .map((product) => ({
      ...product,
      numericPrice: Number(product.extractedPrice)
    }))
    .filter((product) => Number.isFinite(product.numericPrice) && product.numericPrice > 0)
    .sort((a, b) => b.numericPrice - a.numericPrice)
    .slice(0, 2);

  if (!candidates.length) return [];

  const imported = [];

  for (const product of candidates) {
    const sku = externalDraftSku(product);
    const suggestedPrice = Math.round(product.numericPrice * 0.8 * 100) / 100;
    const stockSeed = parseInt(crypto.createHash('sha1').update(sku).digest('hex').slice(0, 8), 16);
    const demoStock = 8 + (stockSeed % 17);
    const sourceUrl = /^https?:\/\//i.test(product.productLink || '') ? product.productLink : null;
    const thumbnail = /^https?:\/\//i.test(product.thumbnail || '') ? product.thumbnail : null;
    const vehicleText = [marca, modelo, ano].filter(Boolean).join(' ');
    const description =
      'Peça automotiva disponível no catálogo Tech Peças' +
      (vehicleText ? ' para pesquisa relacionada a ' + vehicleText : '') +
      '. Produto selecionado para demonstração do projeto, com preço promocional aplicado sobre a referência de mercado.';

    const [result] = await pool.execute(
      `INSERT IGNORE INTO pecas
       (nome, descricao, fabricante, categoria, sku, preco_site, estoque, imagem_url, ativo,
        auto_importado, origem_tipo, origem_nome, origem_url, preco_referencia, auto_import_term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'internet', ?, ?, ?, ?)`,
      [
        normalizeText(product.title) || termo,
        description,
        'Linha Tech Peças',
        'Autopeça',
        sku,
        suggestedPrice,
        demoStock,
        thumbnail,
        normalizeText(product.source) || 'Loja externa',
        sourceUrl,
        product.numericPrice,
        normalizeText([termo, marca, modelo, ano].filter(Boolean).join(' | ')).slice(0, 255)
      ]
    );

    if (result.affectedRows) {
      imported.push({
        id: result.insertId,
        nome: normalizeText(product.title) || termo,
        sku,
        precoReferencia: product.numericPrice,
        precoSugerido: suggestedPrice,
        estoque: demoStock,
        origem: normalizeText(product.source) || 'Loja externa'
      });
    }
  }

  return imported;
}

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

    let autoImportados = [];

    if (result.configured && Array.isArray(result.products) && result.products.length) {
      const hasCatalog = await hasActiveCatalogMatch({ termo, marca, modelo, ano });

      if (!hasCatalog) {
        autoImportados = await autoImportExternalDrafts({
          termo,
          marca,
          modelo,
          ano,
          products: result.products
        });
      }
    }

    return res.json({
      ok: true,
      termo,
      filtros: marca && modelo && ano ? { marca, modelo, ano } : null,
      autoImportados,
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
