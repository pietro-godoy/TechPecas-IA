const STORE_CART_KEY_PREFIX = 'techpecas_cart_v2_';

function storeCartKey() {
  const user = getCurrentUser();
  return user?.id ? STORE_CART_KEY_PREFIX + String(user.id) : null;
}

function storeGetCart() {
  const key = storeCartKey();
  if (!key) return [];

  try {
    const raw = localStorage.getItem(key);
    const cart = raw ? JSON.parse(raw) : [];
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function storeSaveCart(cart) {
  const key = storeCartKey();
  if (!key) return;

  localStorage.setItem(key, JSON.stringify(cart));
  storeUpdateCartBadges();
}

function storeCartCount() {
  return storeGetCart().reduce((sum, item) => sum + Number(item.quantidade || 0), 0);
}

function storeUpdateCartBadges() {
  const user = getCurrentUser();
  const count = user ? storeCartCount() : 0;
  document.querySelectorAll('#cartCount, .cart-count').forEach((el) => {
    el.textContent = String(count);
    el.style.display = count > 0 ? 'inline-grid' : 'none';
  });
}

function storeAddToCart(product) {
  const user = getCurrentUser();
  if (!user) {
    showWarning('Faça login para adicionar produtos ao carrinho.', 'Login necessário');
    return;
  }

  if (!product || !product.id || product.preco_site === null || Number(product.estoque) <= 0) {
    showWarning('Este produto não está disponível para compra agora.');
    return;
  }

  const cart = storeGetCart();
  const existing = cart.find((item) => Number(item.pecaId) === Number(product.id));

  if (existing) {
    const next = Number(existing.quantidade || 1) + 1;
    if (next > Number(product.estoque)) {
      showWarning('Você já adicionou ao carrinho toda a quantidade disponível deste produto.');
      return;
    }
    existing.quantidade = next;
    existing.estoque = Number(product.estoque);
    existing.preco = Number(product.preco_site);
  } else {
    cart.push({
      pecaId: Number(product.id),
      nome: product.nome || 'Produto',
      fabricante: product.fabricante || '',
      sku: product.sku || '',
      imagem_url: product.imagem_url || '',
      preco: Number(product.preco_site),
      estoque: Number(product.estoque),
      quantidade: 1
    });
  }

  storeResetCheckoutToken();
  storeSaveCart(cart);
  showSuccess('Produto adicionado ao carrinho.', 'Carrinho atualizado');
}

function storeMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function storeSafeImage(url) {
  return /^https?:\/\//i.test(String(url || '')) ? String(url) : '';
}

function storeCatalogCard(product) {
  const image = storeSafeImage(product.imagem_url);
  const available = Number(product.estoque) > 0 && product.preco_site !== null;

  return '<article class="catalog-card">' +
    '<div class="catalog-card-media">' +
      (image
        ? '<img src="' + tpEscape(image) + '" alt="" loading="lazy">'
        : '<div class="catalog-placeholder"><span>TP</span></div>') +
    '</div>' +
    '<div class="catalog-card-body">' +
      '<div class="catalog-card-meta">' +
        '<span>' + tpEscape(product.categoria || 'Autopeça') + '</span>' +
        '<span>' + tpEscape(product.sku || '') + '</span>' +
      '</div>' +
      '<h2>' + tpEscape(product.nome || 'Produto') + '</h2>' +
      '<p class="catalog-maker">' + tpEscape(product.fabricante || 'Fabricante não informado') + '</p>' +
      '<p class="catalog-description">' + tpEscape(product.descricao || 'Sem descrição cadastrada.') + '</p>' +
      '<div class="catalog-card-bottom">' +
        '<div>' +
          '<strong class="catalog-price">' + (product.preco_site !== null ? storeMoney(product.preco_site) : 'Consultar') + '</strong>' +
          '<small class="' + (available ? 'stock-ok' : 'stock-out') + '">' +
            (Number(product.estoque) > 0 ? Number(product.estoque) + ' em estoque' : 'Indisponível') +
          '</small>' +
        '</div>' +
        '<button type="button" class="primary-cta button-reset add-cart-button" data-product-id="' + Number(product.id) + '"' +
          (available ? '' : ' disabled') + '>Adicionar <span>+</span></button>' +
      '</div>' +
    '</div>' +
  '</article>';
}

let storeCatalogProducts = [];

async function storeLoadCatalog(term = '') {
  const grid = document.getElementById('catalogGrid');
  const status = document.getElementById('catalogStatus');
  if (!grid) return;

  grid.innerHTML = '';
  if (status) {
    status.style.display = 'block';
    status.textContent = 'Carregando catálogo...';
  }

  const query = term ? '?termo=' + encodeURIComponent(term) : '';
  const result = await apiCall('/catalogo' + query, { method: 'GET' });

  if (!result.ok) {
    if (status) {
      status.textContent = result.msg || 'Não foi possível carregar o catálogo.';
    }
    return;
  }

  storeCatalogProducts = Array.isArray(result.produtos) ? result.produtos : [];

  if (!storeCatalogProducts.length) {
    if (status) {
      status.innerHTML = '<strong>Nenhum produto encontrado.</strong><br><span>Cadastre peças no banco para exibi-las aqui.</span>';
    }
    return;
  }

  if (status) status.style.display = 'none';
  grid.innerHTML = storeCatalogProducts.map(storeCatalogCard).join('');
}

function storeSetQuantity(pecaId, quantity) {
  const cart = storeGetCart();
  const item = cart.find((entry) => Number(entry.pecaId) === Number(pecaId));
  if (!item) return;

  const max = Math.max(1, Number(item.estoque || 1));
  item.quantidade = Math.max(1, Math.min(max, Number(quantity) || 1));
  storeResetCheckoutToken();
  storeSaveCart(cart);
  storeRenderCart();
}

function storeRemoveCartItem(pecaId) {
  const cart = storeGetCart().filter((item) => Number(item.pecaId) !== Number(pecaId));
  storeResetCheckoutToken();
  storeSaveCart(cart);
  storeRenderCart();
}

function storeRenderCart() {
  const container = document.getElementById('cartItems');
  const empty = document.getElementById('cartEmpty');
  const subtotalEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');
  if (!container) return;

  const cart = storeGetCart();
  const subtotal = cart.reduce((sum, item) => sum + Number(item.preco || 0) * Number(item.quantidade || 0), 0);

  if (subtotalEl) subtotalEl.textContent = storeMoney(subtotal);
  if (totalEl) totalEl.textContent = storeMoney(subtotal);

  if (!cart.length) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';

  container.innerHTML = cart.map((item) => {
    const image = storeSafeImage(item.imagem_url);
    return '<article class="cart-item">' +
      '<div class="cart-item-media">' +
        (image ? '<img src="' + tpEscape(image) + '" alt="" loading="lazy">' : '<div class="catalog-placeholder small"><span>TP</span></div>') +
      '</div>' +
      '<div class="cart-item-info">' +
        '<span class="cart-item-sku">' + tpEscape(item.sku || 'TECH PEÇAS') + '</span>' +
        '<h2>' + tpEscape(item.nome || 'Produto') + '</h2>' +
        '<p>' + tpEscape(item.fabricante || '') + '</p>' +
        '<button class="cart-remove" type="button" data-remove-id="' + Number(item.pecaId) + '">Remover</button>' +
      '</div>' +
      '<div class="cart-item-quantity">' +
        '<button type="button" data-qty-minus="' + Number(item.pecaId) + '">−</button>' +
        '<span>' + Number(item.quantidade || 1) + '</span>' +
        '<button type="button" data-qty-plus="' + Number(item.pecaId) + '">+</button>' +
      '</div>' +
      '<strong class="cart-item-price">' + storeMoney(Number(item.preco || 0)) + '</strong>' +
    '</article>';
  }).join('');
}

function storeCheckoutTokenKey() {
  const user = getCurrentUser();
  return user?.id ? 'techpecas_checkout_token_' + user.id : null;
}

function storeGetCheckoutToken() {
  const key = storeCheckoutTokenKey();
  if (!key) return '';

  let token = sessionStorage.getItem(key);
  if (token) return token;

  token = (window.crypto && typeof window.crypto.randomUUID === 'function')
    ? window.crypto.randomUUID()
    : 'checkout-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);

  sessionStorage.setItem(key, token);
  return token;
}

function storeResetCheckoutToken() {
  const key = storeCheckoutTokenKey();
  if (key) sessionStorage.removeItem(key);
}

let storePendingOrderId = null;
let storePaymentPollTimer = null;
let storeOrdersPollTimer = null;

function storeOnlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function storeRenderPaymentResult(payment, pedidoId) {
  const container = document.getElementById('paymentResult');
  if (!container) return;

  container.style.display = 'block';

  const checkoutForm = document.getElementById('checkoutForm');
  if (checkoutForm) checkoutForm.style.display = 'none';

  if (payment.billingType === 'PIX') {
    const pix = payment.pix || {};
    const qrImage = pix.encodedImage
      ? '<img class="pix-qr-image" src="data:image/png;base64,' + pix.encodedImage + '" alt="QR Code Pix">'
      : '';

    container.innerHTML =
      '<div class="payment-success-head"><span class="section-label dark-label">PAGAMENTO</span>' +
      '<h2>Pix gerado para o pedido #' + Number(pedidoId) + '</h2>' +
      '<p>Escaneie o QR Code ou copie o código Pix abaixo.</p></div>' +
      '<div class="pix-payment-box">' +
        qrImage +
        '<div class="pix-payment-details">' +
          '<strong>Aguardando pagamento</strong>' +
          (pix.expirationDate ? '<small>Expira em ' + tpEscape(new Date(pix.expirationDate).toLocaleString('pt-BR')) + '</small>' : '') +
          (pix.payload
            ? '<textarea id="pixPayload" readonly>' + tpEscape(pix.payload) + '</textarea>' +
              '<button id="copyPixButton" type="button" class="secondary-cta button-reset">Copiar Pix</button>'
            : '<p class="muted-text">QR Code criado, mas o código copia e cola não foi retornado.</p>') +
        '</div>' +
      '</div>' +
      '<p id="paymentLiveStatus" class="payment-live-status">Aguardando confirmação do Asaas...</p>' +
      '<div class="payment-result-actions">' +
        '<a class="primary-cta" href="pedidos.html?pedido=' + Number(pedidoId) + '">Acompanhar pedido <span>→</span></a>' +
        '<a class="secondary-cta" href="catalogo.html">Continuar comprando</a>' +
      '</div>';

    document.getElementById('copyPixButton')?.addEventListener('click', async () => {
      const payload = document.getElementById('pixPayload')?.value || '';
      if (!payload) return;

      try {
        await navigator.clipboard.writeText(payload);
        showSuccess('Código Pix copiado.');
      } catch {
        const field = document.getElementById('pixPayload');
        field?.select();
        document.execCommand('copy');
        showSuccess('Código Pix copiado.');
      }
    });

    storeStartPaymentPolling(pedidoId);
  } else {
    const invoiceUrl = /^https?:\/\//i.test(payment.invoiceUrl || '') ? payment.invoiceUrl : '';

    container.innerHTML =
      '<div class="payment-success-head"><span class="section-label dark-label">PAGAMENTO SEGURO</span>' +
      '<h2>Pedido #' + Number(pedidoId) + ' criado</h2>' +
      '<p>Os dados do cartão serão preenchidos diretamente no ambiente seguro do Asaas.</p></div>' +
      (invoiceUrl
        ? '<a class="primary-cta payment-asaas-link" href="' + tpEscape(invoiceUrl) + '" target="_blank" rel="noopener noreferrer">Pagar com cartão no Asaas <span>↗</span></a>'
        : '<p class="muted-text">A cobrança foi criada, mas o Asaas não retornou a página de pagamento.</p>') +
      '<p id="paymentLiveStatus" class="payment-live-status">Aguardando confirmação do pagamento...</p>' +
      '<div class="payment-result-actions">' +
        '<a class="secondary-cta" href="pedidos.html?pedido=' + Number(pedidoId) + '">Acompanhar pedido</a>' +
        '<a class="secondary-cta" href="catalogo.html">Continuar comprando</a>' +
      '</div>';

    storeStartPaymentPolling(pedidoId);
  }

  requestAnimationFrame(() => {
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function storeStopPaymentPolling() {
  if (storePaymentPollTimer) {
    clearInterval(storePaymentPollTimer);
    storePaymentPollTimer = null;
  }
}

function storeStartPaymentPolling(pedidoId) {
  storeStopPaymentPolling();

  let attempts = 0;
  const maxAttempts = 36;

  const check = async () => {
    attempts += 1;
    const result = await apiCall('/pagamentos/asaas/pedido/' + Number(pedidoId), { method: 'GET' });

    if (result.ok && result.pedido) {
      const statusEl = document.getElementById('paymentLiveStatus');

      const status = result.pedido.status;

      if (status === 'pago') {
        if (statusEl) {
          statusEl.textContent = 'Pagamento confirmado. Pedido pago.';
          statusEl.className = 'payment-live-status confirmed';
        }
        storePendingOrderId = null;
        storeResetCheckoutToken();
        storeStopPaymentPolling();
        return;
      }

      if (status === 'pago_revisar_estoque') {
        if (statusEl) {
          statusEl.textContent = 'Pagamento confirmado, mas o estoque precisa ser revisado pela loja.';
          statusEl.className = 'payment-live-status attention';
        }
        storePendingOrderId = null;
        storeResetCheckoutToken();
        storeStopPaymentPolling();
        return;
      }

      if (status === 'analise_risco') {
        if (statusEl) {
          statusEl.textContent = 'Pagamento em análise de segurança pelo Asaas.';
          statusEl.className = 'payment-live-status attention';
        }
        return;
      }

      if (status === 'pagamento_recusado') {
        if (statusEl) {
          statusEl.textContent = 'Pagamento recusado. Você pode tentar novamente ou usar outra forma de pagamento.';
          statusEl.className = 'payment-live-status cancelled';
        }
        storeStopPaymentPolling();
        return;
      }

      if (status === 'vencido') {
        if (statusEl) {
          statusEl.textContent = 'A cobrança venceu sem confirmação de pagamento.';
          statusEl.className = 'payment-live-status cancelled';
        }
        storeStopPaymentPolling();
        return;
      }

      if (['cancelado', 'estornado', 'estornado_parcial', 'chargeback', 'chargeback_em_disputa', 'chargeback_em_reversao'].includes(status)) {
        if (statusEl) {
          statusEl.textContent = storeOrderStatus(status) + '.';
          statusEl.className = 'payment-live-status cancelled';
        }
        storeStopPaymentPolling();
        return;
      }

      if (status === 'estorno_em_processamento') {
        if (statusEl) {
          statusEl.textContent = 'Estorno em processamento.';
          statusEl.className = 'payment-live-status attention';
        }
        return;
      }
    }

    if (attempts >= maxAttempts) {
      storeStopPaymentPolling();
    }
  };

  check();
  storePaymentPollTimer = setInterval(check, 5000);
}

async function storeCreateAsaasPayment(pedidoId, pagador) {
  return apiCall('/pagamentos/asaas/criar', {
    method: 'POST',
    body: JSON.stringify({
      pedidoId,
      pagador
    })
  });
}

async function storeCheckPaymentAvailability() {
  const form = document.getElementById('checkoutForm');
  const button = document.getElementById('checkoutSubmit');
  if (!form || !button) return;

  const result = await apiCall('/pagamentos/asaas/status', { method: 'GET' });

  if (!result.ok || !result.configured) {
    button.disabled = true;
    button.innerHTML = 'Pagamento indisponível';
    button.title = 'Configure o Asaas Sandbox no servidor para finalizar pedidos.';

    let warning = document.getElementById('checkoutPaymentWarning');
    if (!warning) {
      warning = document.createElement('div');
      warning.id = 'checkoutPaymentWarning';
      warning.className = 'checkout-payment-warning';
      form.insertBefore(warning, button);
    }

    warning.innerHTML =
      '<strong>Pagamento ainda não configurado</strong>' +
      '<span>O Asaas Sandbox precisa estar configurado no servidor antes de finalizar pedidos.</span>';
    return;
  }

  button.disabled = false;
  button.innerHTML = 'Finalizar pedido <span>→</span>';
}

async function storeSubmitCheckout(event) {
  event.preventDefault();

  const asaasStatus = await apiCall('/pagamentos/asaas/status', { method: 'GET' });
  if (!asaasStatus.ok || !asaasStatus.configured) {
    showError(
      'O pagamento ainda não está configurado no servidor. Configure o Asaas Sandbox antes de finalizar o pedido.',
      'Pagamento indisponível'
    );
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    showWarning('Faça login para finalizar sua compra.', 'Login necessário');
    return;
  }

  const cart = storeGetCart();
  if (!cart.length && !storePendingOrderId) {
    showWarning('Seu carrinho está vazio.');
    return;
  }

  const formaPagamento = document.querySelector('input[name="formaPagamento"]:checked')?.value || 'pix';
  const pagador = {
    name: document.getElementById('checkoutNome')?.value.trim(),
    cpfCnpj: storeOnlyDigits(document.getElementById('checkoutCpfCnpj')?.value),
    email: document.getElementById('checkoutEmail')?.value.trim(),
    mobilePhone: storeOnlyDigits(document.getElementById('checkoutCelular')?.value)
  };
  const endereco = {
    cep: document.getElementById('checkoutCep')?.value.trim(),
    logradouro: document.getElementById('checkoutLogradouro')?.value.trim(),
    numero: document.getElementById('checkoutNumero')?.value.trim(),
    complemento: document.getElementById('checkoutComplemento')?.value.trim(),
    cidade: document.getElementById('checkoutCidade')?.value.trim(),
    estado: document.getElementById('checkoutEstado')?.value.trim().toUpperCase()
  };

  if (!pagador.name || ![11, 14].includes(pagador.cpfCnpj.length)) {
    showWarning('Informe o nome completo e um CPF/CNPJ válido para gerar a cobrança.');
    return;
  }

  if (!endereco.cep || !endereco.logradouro || !endereco.numero || !endereco.cidade || endereco.estado.length !== 2) {
    showWarning('Preencha CEP, logradouro, número, cidade e estado antes de finalizar.');
    return;
  }

  const checkoutToken = storeGetCheckoutToken();
  if (!checkoutToken) {
    showError('Não foi possível identificar este checkout. Atualize a página e tente novamente.');
    return;
  }

  const button = document.getElementById('checkoutSubmit');
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="search-button-spinner" aria-hidden="true"></span><span>Gerando pagamento...</span>';
  }

  let pedidoId = storePendingOrderId;

  try {
    if (!pedidoId) {
      const result = await apiCall('/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          usuarioId: user.id,
          checkoutToken,
          itens: cart.map((item) => ({ pecaId: item.pecaId, quantidade: item.quantidade })),
          formaPagamento,
          endereco
        })
      });

      if (!result.ok) {
        showError(result.msg || 'Não foi possível criar o pedido.');
        return;
      }

      pedidoId = result.pedido.id;
      storePendingOrderId = pedidoId;
    }

    const payment = await storeCreateAsaasPayment(pedidoId, pagador);

    if (!payment.ok) {
      if (button) {
        button.innerHTML = 'Tentar pagamento novamente <span>→</span>';
      }
      showError(
        'O pedido #' + pedidoId + ' foi criado, mas o pagamento não pôde ser gerado. ' +
        (payment.msg || 'Tente novamente.')
      );
      return;
    }

    storeSaveCart([]);
    storePendingOrderId = pedidoId;
    storeRenderPaymentResult(payment, pedidoId);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = storePendingOrderId
        ? 'Atualizar pagamento <span>→</span>'
        : 'Finalizar pedido <span>→</span>';
    }
  }
}

function storeOrderStatus(status) {
  const labels = {
    aguardando_pagamento: 'Aguardando pagamento',
    analise_risco: 'Em análise de segurança',
    pagamento_recusado: 'Pagamento recusado',
    vencido: 'Pagamento vencido',
    pago: 'Pago',
    pago_revisar_estoque: 'Pago — revisar estoque',
    preparando: 'Preparando',
    enviado: 'Enviado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
    estorno_em_processamento: 'Estorno em processamento',
    estornado_parcial: 'Estornado parcialmente',
    estornado: 'Estornado',
    chargeback: 'Chargeback recebido',
    chargeback_em_disputa: 'Chargeback em disputa',
    chargeback_em_reversao: 'Chargeback em reversão'
  };
  return labels[status] || status || 'Pedido';
}

async function storeLoadOrders(options = {}) {
  const container = document.getElementById('ordersList');
  if (!container) return;

  const user = getCurrentUser();
  if (!user) {
    container.innerHTML = '<div class="order-empty"><h2>Entre para ver seus pedidos.</h2><a class="primary-cta" href="login.html">Fazer login <span>→</span></a></div>';
    return;
  }

  const silent = options.silent === true;
  if (!silent) {
    container.innerHTML = '<div class="store-status">Carregando pedidos...</div>';
  }

  const result = await apiCall('/pedidos?usuarioId=' + encodeURIComponent(user.id), { method: 'GET' });

  if (!result.ok) {
    if (!silent) {
      container.innerHTML = '<div class="store-status">' + tpEscape(result.msg || 'Não foi possível carregar os pedidos.') + '</div>';
    }
    return;
  }

  const orders = Array.isArray(result.pedidos) ? result.pedidos : [];
  if (!orders.length) {
    container.innerHTML = '<div class="order-empty"><h2>Você ainda não fez nenhum pedido.</h2><p>Quando comprar no Tech Peças, seus pedidos aparecerão aqui.</p><a class="primary-cta" href="catalogo.html">Abrir catálogo <span>→</span></a></div>';
    return;
  }

  const highlight = new URLSearchParams(window.location.search).get('pedido');

  function renderOrderCard(order) {
    const active = String(order.id) === String(highlight);
    const paid = ['pago','pago_revisar_estoque','preparando','enviado','concluido'].includes(order.status);

    return '<article class="order-card ' + (paid ? 'order-card-paid' : 'order-card-pending') + (active ? ' highlighted' : '') + '">' +
      '<div class="order-card-top">' +
        '<div><span class="order-number">PEDIDO #' + Number(order.id) + '</span>' +
        '<h2 class="order-status-title ' + (paid ? 'paid' : 'pending') + '">' + storeOrderStatus(order.status) + '</h2></div>' +
        '<strong>' + storeMoney(order.valor_total) + '</strong>' +
      '</div>' +
      '<p class="order-summary">' + tpEscape(order.resumo_itens || order.total_itens + ' item(ns)') + '</p>' +
      '<div class="order-footer">' +
        '<span>' + new Date(order.criado_em).toLocaleString('pt-BR') + '</span>' +
        '<span>' + (order.forma_pagamento === 'pix' ? 'Pix' : 'Cartão') + '</span>' +
      '</div>' +
      (['pagamento_recusado','vencido','cancelado'].includes(order.status)
        ? '<div class="order-retry-row"><a class="secondary-cta" href="carrinho.html?pedido=' + Number(order.id) + '">Tentar pagamento novamente</a></div>'
        : '') +
    '</article>';
  }

  const pendingOrders = orders.filter((order) =>
    !['pago','pago_revisar_estoque','preparando','enviado','concluido'].includes(order.status)
  );

  const paidOrders = orders.filter((order) =>
    ['pago','pago_revisar_estoque','preparando','enviado','concluido'].includes(order.status)
  );

  const ordersHtml =
    (pendingOrders.length
      ? '<section class="orders-status-group pending-group">' +
          '<div class="orders-group-head"><span class="section-label dark-label">PENDENTES</span><strong>' + pendingOrders.length + '</strong></div>' +
          pendingOrders.map(renderOrderCard).join('') +
        '</section>'
      : '') +
    (paidOrders.length
      ? '<section class="orders-status-group paid-group">' +
          '<div class="orders-group-head"><span class="section-label dark-label">PAGOS</span><strong>' + paidOrders.length + '</strong></div>' +
          paidOrders.map(renderOrderCard).join('') +
        '</section>'
      : '');

  if (container.innerHTML !== ordersHtml) {
    container.innerHTML = ordersHtml;
  }
}

function storeStopOrdersPolling() {
  if (storeOrdersPollTimer) {
    clearInterval(storeOrdersPollTimer);
    storeOrdersPollTimer = null;
  }
}

function storeStartOrdersPolling() {
  if (!document.getElementById('ordersList')) return;

  storeStopOrdersPolling();

  storeOrdersPollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      storeLoadOrders({ silent: true });
    }
  }, 5000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.getElementById('ordersList')) {
      storeLoadOrders({ silent: true });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  storeUpdateCartBadges();

  const retryPedidoId = Number(new URLSearchParams(window.location.search).get('pedido') || 0);
  if (retryPedidoId && document.getElementById('checkoutForm')) {
    storePendingOrderId = retryPedidoId;
    const paymentResult = document.getElementById('paymentResult');
    if (paymentResult) {
      paymentResult.style.display = 'block';
      paymentResult.innerHTML =
        '<div class="payment-success-head"><span class="section-label dark-label">NOVA TENTATIVA</span>' +
        '<h2>Pedido #' + retryPedidoId + '</h2>' +
        '<p>Revise os dados do pagador e gere uma nova tentativa de pagamento.</p></div>';
    }
    const submit = document.getElementById('checkoutSubmit');
    if (submit) submit.innerHTML = 'Tentar pagamento novamente <span>→</span>';
  }

  const checkoutEmailField = document.getElementById('checkoutEmail');
  const currentUserForCheckout = getCurrentUser();
  if (checkoutEmailField && currentUserForCheckout?.email && !checkoutEmailField.value) {
    checkoutEmailField.value = currentUserForCheckout.email;
  }

  const catalogGrid = document.getElementById('catalogGrid');
  if (catalogGrid) {
    storeLoadCatalog();

    const search = document.getElementById('catalogSearch');
    document.getElementById('catalogSearchBtn')?.addEventListener('click', () => {
      storeLoadCatalog(search?.value.trim() || '');
    });
    document.getElementById('catalogClearBtn')?.addEventListener('click', () => {
      if (search) search.value = '';
      storeLoadCatalog();
    });
    search?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        storeLoadCatalog(search.value.trim());
      }
    });

    catalogGrid.addEventListener('click', (event) => {
      const button = event.target.closest('.add-cart-button');
      if (!button) return;
      const product = storeCatalogProducts.find((item) => Number(item.id) === Number(button.dataset.productId));
      storeAddToCart(product);
    });
  }

  const cartItems = document.getElementById('cartItems');
  if (cartItems) {
    storeRenderCart();
    storeCheckPaymentAvailability();

    cartItems.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-id]');
      if (remove) return storeRemoveCartItem(Number(remove.dataset.removeId));

      const minus = event.target.closest('[data-qty-minus]');
      if (minus) {
        const id = Number(minus.dataset.qtyMinus);
        const item = storeGetCart().find((entry) => Number(entry.pecaId) === id);
        if (item) storeSetQuantity(id, Number(item.quantidade) - 1);
        return;
      }

      const plus = event.target.closest('[data-qty-plus]');
      if (plus) {
        const id = Number(plus.dataset.qtyPlus);
        const item = storeGetCart().find((entry) => Number(entry.pecaId) === id);
        if (item) storeSetQuantity(id, Number(item.quantidade) + 1);
      }
    });

    document.getElementById('checkoutForm')?.addEventListener('submit', storeSubmitCheckout);
  }

  if (document.getElementById('ordersList')) {
    storeLoadOrders();
    storeStartOrdersPolling();
  }
});