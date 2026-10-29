const STORE_CART_KEY = 'techpecas_cart_v1';

function storeGetCart() {
  try {
    const raw = localStorage.getItem(STORE_CART_KEY);
    const cart = raw ? JSON.parse(raw) : [];
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function storeSaveCart(cart) {
  localStorage.setItem(STORE_CART_KEY, JSON.stringify(cart));
  storeUpdateCartBadges();
}

function storeCartCount() {
  return storeGetCart().reduce((sum, item) => sum + Number(item.quantidade || 0), 0);
}

function storeUpdateCartBadges() {
  const count = storeCartCount();
  document.querySelectorAll('#cartCount, .cart-count').forEach((el) => {
    el.textContent = String(count);
    el.style.display = count > 0 ? 'inline-grid' : 'none';
  });
}

function storeAddToCart(product) {
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
          '<small class="' + (Number(product.estoque) > 0 ? 'stock-ok' : 'stock-out') + '">' +
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
  storeSaveCart(cart);
  storeRenderCart();
}

function storeRemoveCartItem(pecaId) {
  const cart = storeGetCart().filter((item) => Number(item.pecaId) !== Number(pecaId));
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
      '<strong class="cart-item-price">' + storeMoney(Number(item.preco || 0) * Number(item.quantidade || 0)) + '</strong>' +
    '</article>';
  }).join('');
}

async function storeSubmitCheckout(event) {
  event.preventDefault();

  const user = getCurrentUser();
  if (!user) {
    showWarning('Faça login para finalizar sua compra.', 'Login necessário');
    return;
  }

  const cart = storeGetCart();
  if (!cart.length) {
    showWarning('Seu carrinho está vazio.');
    return;
  }

  const formaPagamento = document.querySelector('input[name="formaPagamento"]:checked')?.value || 'pix';
  const endereco = {
    cep: document.getElementById('checkoutCep')?.value.trim(),
    logradouro: document.getElementById('checkoutLogradouro')?.value.trim(),
    numero: document.getElementById('checkoutNumero')?.value.trim(),
    complemento: document.getElementById('checkoutComplemento')?.value.trim(),
    cidade: document.getElementById('checkoutCidade')?.value.trim(),
    estado: document.getElementById('checkoutEstado')?.value.trim().toUpperCase()
  };

  const button = document.getElementById('checkoutSubmit');
  if (button) {
    button.disabled = true;
    button.textContent = 'Criando pedido...';
  }

  const result = await apiCall('/pedidos', {
    method: 'POST',
    body: JSON.stringify({
      usuarioId: user.id,
      itens: cart.map((item) => ({ pecaId: item.pecaId, quantidade: item.quantidade })),
      formaPagamento,
      endereco
    })
  });

  if (button) {
    button.disabled = false;
    button.innerHTML = 'Criar pedido <span>→</span>';
  }

  if (!result.ok) {
    showError(result.msg || 'Não foi possível criar o pedido.');
    return;
  }

  storeSaveCart([]);
  showSuccess(
    'Pedido #' + result.pedido.id + ' criado. O pagamento será conectado na próxima etapa.',
    'Pedido criado',
    () => { window.location.href = 'pedidos.html?pedido=' + encodeURIComponent(result.pedido.id); }
  );
}

function storeOrderStatus(status) {
  const labels = {
    aguardando_pagamento: 'Aguardando pagamento',
    pago: 'Pago',
    preparando: 'Preparando',
    enviado: 'Enviado',
    concluido: 'Concluído',
    cancelado: 'Cancelado'
  };
  return labels[status] || status || 'Pedido';
}

async function storeLoadOrders() {
  const container = document.getElementById('ordersList');
  if (!container) return;

  const user = getCurrentUser();
  if (!user) {
    container.innerHTML = '<div class="order-empty"><h2>Entre para ver seus pedidos.</h2><a class="primary-cta" href="login.html">Fazer login <span>→</span></a></div>';
    return;
  }

  container.innerHTML = '<div class="store-status">Carregando pedidos...</div>';
  const result = await apiCall('/pedidos?usuarioId=' + encodeURIComponent(user.id), { method: 'GET' });

  if (!result.ok) {
    container.innerHTML = '<div class="store-status">' + tpEscape(result.msg || 'Não foi possível carregar os pedidos.') + '</div>';
    return;
  }

  const orders = Array.isArray(result.pedidos) ? result.pedidos : [];
  if (!orders.length) {
    container.innerHTML = '<div class="order-empty"><h2>Você ainda não fez nenhum pedido.</h2><p>Quando comprar no Tech Peças, seus pedidos aparecerão aqui.</p><a class="primary-cta" href="catalogo.html">Abrir catálogo <span>→</span></a></div>';
    return;
  }

  const highlight = new URLSearchParams(window.location.search).get('pedido');

  container.innerHTML = orders.map((order) => {
    const active = String(order.id) === String(highlight);
    return '<article class="order-card' + (active ? ' highlighted' : '') + '">' +
      '<div class="order-card-top">' +
        '<div><span class="order-number">PEDIDO #' + Number(order.id) + '</span><h2>' + storeOrderStatus(order.status) + '</h2></div>' +
        '<strong>' + storeMoney(order.valor_total) + '</strong>' +
      '</div>' +
      '<p class="order-summary">' + tpEscape(order.resumo_itens || order.total_itens + ' item(ns)') + '</p>' +
      '<div class="order-footer">' +
        '<span>' + new Date(order.criado_em).toLocaleString('pt-BR') + '</span>' +
        '<span>' + (order.forma_pagamento === 'pix' ? 'Pix' : 'Cartão') + '</span>' +
      '</div>' +
    '</article>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  storeUpdateCartBadges();

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

  storeLoadOrders();
});