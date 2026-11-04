let adminProducts = [];
let adminOrders = [];
let adminSandbox = false;
let adminOrdersPollTimer = null;

function adminMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function adminStatusLabel(status) {
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

function adminParseCompatibilities(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      return {
        marca: parts[0] || '',
        modelo: parts[1] || '',
        ano_inicio: Number(parts[2] || 0),
        ano_fim: Number(parts[3] || 0),
        observacao: parts[4] || ''
      };
    })
    .filter((item) => item.marca && item.modelo && item.ano_inicio && item.ano_fim);
}

function adminFormatCompatibilities(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => [
      item.marca || '',
      item.modelo || '',
      item.ano_inicio || '',
      item.ano_fim || '',
      item.observacao || ''
    ].join(' | '))
    .join('\n');
}

function adminResetForm() {
  document.getElementById('adminProductForm')?.reset();
  const id = document.getElementById('adminProductId');
  const ativo = document.getElementById('adminAtivo');
  const estoque = document.getElementById('adminEstoque');
  const title = document.getElementById('adminFormTitle');
  const cancel = document.getElementById('adminCancelEdit');

  if (id) id.value = '';
  if (ativo) ativo.checked = true;
  if (estoque) estoque.value = '0';
  if (title) title.textContent = 'Cadastrar produto';
  if (cancel) cancel.style.display = 'none';
}

async function adminLoadSummary() {
  const container = document.getElementById('adminStats');
  if (!container) return;

  const result = await apiCall('/admin/resumo', { method: 'GET' });
  if (!result.ok) return;

  const r = result.resumo || {};
  container.innerHTML =
    '<article><span>Produtos</span><strong>' + Number(r.produtos || 0) + '</strong><small>' + Number(r.produtosAtivos || 0) + ' ativos</small></article>' +
    '<article><span>Estoque baixo</span><strong>' + Number(r.estoqueBaixo || 0) + '</strong><small>3 unidades ou menos</small></article>' +
    '<article><span>Pedidos</span><strong>' + Number(r.pedidos || 0) + '</strong><small>' + Number(r.aguardandoPagamento || 0) + ' aguardando pagamento</small></article>' +
    '<article><span>Valor em pedidos</span><strong>' + adminMoney(r.valorPedidos || 0) + '</strong><small>exceto cancelados</small></article>' +
    '<article><span>Usuários</span><strong>' + Number(r.usuarios || 0) + '</strong><small>contas cadastradas</small></article>';
}

function adminRenderProducts(filter = '') {
  const container = document.getElementById('adminProductsList');
  const count = document.getElementById('adminProductCount');
  if (!container) return;

  const term = String(filter || '').trim().toLowerCase();
  const list = adminProducts.filter((product) => {
    if (!term) return true;
    return [
      product.nome,
      product.sku,
      product.fabricante,
      product.categoria
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });

  if (count) count.textContent = list.length + (list.length === 1 ? ' produto' : ' produtos');

  if (!list.length) {
    container.innerHTML = '<div class="admin-empty">Nenhum produto encontrado.</div>';
    return;
  }

  container.innerHTML = list.map((product) => {
    const image = /^https?:\/\//i.test(product.imagem_url || '') ? product.imagem_url : '';
    return '<article class="admin-product-row">' +
      '<div class="admin-product-thumb">' +
        (image ? '<img src="' + tpEscape(image) + '" alt="" loading="lazy">' : '<span>TP</span>') +
      '</div>' +
      '<div class="admin-product-main">' +
        '<div class="admin-product-title-line">' +
          '<h3>' + tpEscape(product.nome || '') + '</h3>' +
          '<span class="admin-status-chip ' + (Number(product.ativo) === 1 ? 'active' : 'inactive') + '">' +
            (Number(product.ativo) === 1 ? 'Ativo' : 'Inativo') +
          '</span>' +
          (Number(product.auto_importado) === 1
            ? '<span class="admin-import-chip">Importado da internet</span>'
            : '') +
        '</div>' +
        '<p>' + tpEscape(product.fabricante || 'Sem fabricante') + ' · ' + tpEscape(product.categoria || 'Sem categoria') + '</p>' +
        '<div class="admin-product-meta">' +
          '<span>SKU ' + tpEscape(product.sku || '—') + '</span>' +
          '<span>' + Number(product.estoque || 0) + ' em estoque</span>' +
          '<span>' + Number(product.total_compatibilidades || 0) + ' compat.</span>' +
          (Number(product.auto_importado) === 1 && product.preco_referencia !== null
            ? '<span>Referência ' + adminMoney(product.preco_referencia) + '</span>'
            : '') +
          (Number(product.auto_importado) === 1 && product.origem_nome
            ? '<span>Origem: ' + tpEscape(product.origem_nome) + '</span>'
            : '') +
        '</div>' +
        (Number(product.auto_importado) === 1 && /^https?:\/\//i.test(product.origem_url || '')
          ? '<a class="admin-source-link" href="' + tpEscape(product.origem_url) + '" target="_blank" rel="noopener noreferrer">Ver oferta de referência ↗</a>'
          : '') +
      '</div>' +
      '<div class="admin-product-price-block">' +
        (Number(product.auto_importado) === 1 && product.preco_referencia !== null
          ? '<small>-20% sugerido</small>'
          : '') +
        '<strong class="admin-product-price">' + (product.preco_site === null ? 'Consultar' : adminMoney(product.preco_site)) + '</strong>' +
      '</div>' +
      '<div class="admin-product-actions">' +
        '<button type="button" data-admin-edit="' + Number(product.id) + '">Editar</button>' +
        '<button type="button" data-admin-toggle="' + Number(product.id) + '" data-next="' + (Number(product.ativo) === 1 ? 0 : 1) + '">' +
          (Number(product.ativo) === 1 ? 'Desativar' : 'Ativar') +
        '</button>' +
        '<button type="button" class="danger" data-admin-delete="' + Number(product.id) + '">Excluir</button>' +
      '</div>' +
    '</article>';
  }).join('');
}

async function adminLoadProducts() {
  const container = document.getElementById('adminProductsList');
  if (container) container.innerHTML = '<div class="admin-empty">Carregando produtos...</div>';

  const result = await apiCall('/admin/produtos', { method: 'GET' });

  if (!result.ok) {
    if (container) container.innerHTML = '<div class="admin-empty">' + tpEscape(result.msg || 'Não foi possível carregar os produtos.') + '</div>';
    return;
  }

  adminProducts = Array.isArray(result.produtos) ? result.produtos : [];
  adminRenderProducts(document.getElementById('adminProductSearch')?.value || '');
}

async function adminEditProduct(id) {
  const result = await apiCall('/admin/produtos/' + Number(id), { method: 'GET' });
  if (!result.ok) return showError(result.msg || 'Não foi possível carregar o produto.');

  const p = result.produto || {};
  document.getElementById('adminProductId').value = p.id || '';
  document.getElementById('adminNome').value = p.nome || '';
  document.getElementById('adminSku').value = p.sku || '';
  document.getElementById('adminFabricante').value = p.fabricante || '';
  document.getElementById('adminCategoria').value = p.categoria || '';
  document.getElementById('adminPreco').value = p.preco_site ?? '';
  document.getElementById('adminEstoque').value = p.estoque ?? 0;
  document.getElementById('adminImagem').value = p.imagem_url || '';
  document.getElementById('adminDescricao').value = p.descricao || '';
  document.getElementById('adminAtivo').checked = Number(p.ativo) === 1;
  document.getElementById('adminCompatibilidades').value = adminFormatCompatibilities(result.compatibilidades);
  document.getElementById('adminFormTitle').textContent = 'Editar produto #' + Number(p.id);
  document.getElementById('adminCancelEdit').style.display = 'inline-block';

  document.querySelector('.admin-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function adminSaveProduct(event) {
  event.preventDefault();

  const id = Number(document.getElementById('adminProductId').value || 0);
  const payload = {
    nome: document.getElementById('adminNome').value.trim(),
    sku: document.getElementById('adminSku').value.trim(),
    fabricante: document.getElementById('adminFabricante').value.trim(),
    categoria: document.getElementById('adminCategoria').value.trim(),
    preco_site: document.getElementById('adminPreco').value,
    estoque: Number(document.getElementById('adminEstoque').value || 0),
    imagem_url: document.getElementById('adminImagem').value.trim(),
    descricao: document.getElementById('adminDescricao').value.trim(),
    ativo: document.getElementById('adminAtivo').checked ? 1 : 0,
    compatibilidades: adminParseCompatibilities(document.getElementById('adminCompatibilidades').value)
  };

  if (!payload.nome || !payload.sku) {
    return showWarning('Nome da peça e SKU são obrigatórios.');
  }

  const button = document.getElementById('adminSaveProduct');
  if (button) {
    button.disabled = true;
    button.textContent = id ? 'Salvando alterações...' : 'Cadastrando...';
  }

  const result = await apiCall(id ? '/admin/produtos/' + id : '/admin/produtos', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload)
  });

  if (button) {
    button.disabled = false;
    button.innerHTML = 'Salvar produto <span>→</span>';
  }

  if (!result.ok) return showError(result.msg || 'Não foi possível salvar o produto.');

  showSuccess(result.msg || 'Produto salvo com sucesso.');
  adminResetForm();
  await Promise.all([adminLoadProducts(), adminLoadSummary()]);
}

async function adminToggleProduct(id, ativo) {
  const result = await apiCall('/admin/produtos/' + Number(id) + '/status', {
    method: 'PATCH',
    body: JSON.stringify({ ativo: Number(ativo) })
  });

  if (!result.ok) return showError(result.msg || 'Não foi possível alterar o produto.');
  await Promise.all([adminLoadProducts(), adminLoadSummary()]);
}

async function adminDeleteProduct(id) {
  showConfirm(
    'Deseja realmente excluir este produto? Se ele já estiver em algum pedido, o sistema não permitirá a exclusão.',
    async function() {
      const result = await apiCall('/admin/produtos/' + Number(id), { method: 'DELETE' });
      if (!result.ok) return showError(result.msg || 'Não foi possível excluir o produto.');
      showSuccess('Produto excluído.');
      await Promise.all([adminLoadProducts(), adminLoadSummary()]);
    },
    null,
    'Excluir produto?'
  );
}

function adminOrderCanConfirm(order) {
  return adminSandbox &&
    Boolean(order.asaas_payment_id) &&
    ['aguardando_pagamento', 'analise_risco', 'vencido'].includes(order.status);
}

function adminOrderCanCancel(order) {
  return ['aguardando_pagamento', 'analise_risco', 'pagamento_recusado', 'vencido'].includes(order.status);
}

function adminOrderCanRefund(order) {
  return Boolean(order.asaas_payment_id) &&
    ['pago', 'pago_revisar_estoque', 'preparando'].includes(order.status);
}

function adminOrderCanManageLogistics(order) {
  return ['pago', 'pago_revisar_estoque', 'preparando', 'enviado', 'concluido'].includes(order.status);
}

function adminRenderOrders() {
  const container = document.getElementById('adminOrdersList');
  if (!container) return;

  if (!adminOrders.length) {
    container.innerHTML = '<div class="admin-empty">Nenhum pedido criado ainda.</div>';
    return;
  }

  container.innerHTML = adminOrders.map((order) => {
    const statusClass = ['pago','preparando','enviado','concluido'].includes(order.status)
      ? 'paid'
      : (['cancelado','estornado','estorno_em_processamento','pagamento_recusado','vencido'].includes(order.status) ? 'danger' : 'pending');

    const paymentActions =
      (adminOrderCanConfirm(order)
        ? '<button type="button" class="admin-order-action success" data-admin-confirm-payment="' + Number(order.id) + '">Confirmar pagamento</button>'
        : '') +
      (adminOrderCanRefund(order)
        ? '<button type="button" class="admin-order-action warning" data-admin-refund="' + Number(order.id) + '">Estornar</button>'
        : '') +
      (adminOrderCanCancel(order)
        ? '<button type="button" class="admin-order-action danger" data-admin-cancel="' + Number(order.id) + '">Cancelar</button>'
        : '');

    const logistics = adminOrderCanManageLogistics(order)
      ? '<label class="admin-logistics-select">Andamento' +
          '<select data-order-status="' + Number(order.id) + '">' +
            '<option value="" selected disabled>Alterar etapa</option>' +
            '<option value="preparando">Preparando</option>' +
            '<option value="enviado">Enviado</option>' +
            '<option value="concluido">Concluído</option>' +
          '</select>' +
        '</label>'
      : '';

    return '<article class="admin-order-card">' +
      '<div class="admin-order-card-head">' +
        '<div>' +
          '<span class="order-number">PEDIDO #' + Number(order.id) + '</span>' +
          '<h3>' + tpEscape(order.username || 'Cliente') + '</h3>' +
          '<p>' + tpEscape(order.email || '') + '</p>' +
        '</div>' +
        '<div class="admin-order-total"><span>Total</span><strong>' + adminMoney(order.valor_total) + '</strong></div>' +
      '</div>' +
      '<div class="admin-order-info-grid">' +
        '<div><span>Status</span><strong class="admin-order-status-chip ' + statusClass + '">' + adminStatusLabel(order.status) + '</strong></div>' +
        '<div><span>Pagamento</span><strong>' + (order.forma_pagamento === 'pix' ? 'Pix' : 'Cartão') + '</strong></div>' +
        '<div><span>Itens</span><strong>' + Number(order.total_itens || 0) + '</strong></div>' +
        '<div><span>Data</span><strong>' + new Date(order.criado_em).toLocaleString('pt-BR') + '</strong></div>' +
      '</div>' +
      (order.resumo_itens ? '<p class="admin-order-summary">' + tpEscape(order.resumo_itens) + '</p>' : '') +
      '<div class="admin-order-actions-bar">' +
        '<button type="button" class="admin-order-action" data-admin-order-details="' + Number(order.id) + '">Ver cliente e pedido</button>' +
        paymentActions +
        logistics +
      '</div>' +
      '<div id="admin-order-details-' + Number(order.id) + '" class="admin-order-details" style="display:none;"></div>' +
    '</article>';
  }).join('');
}

async function adminLoadOrders(options = {}) {
  const container = document.getElementById('adminOrdersList');
  const silent = options.silent === true;

  if (container && !silent) {
    container.innerHTML = '<div class="admin-empty">Carregando pedidos...</div>';
  }

  const result = await apiCall('/admin/pedidos', { method: 'GET' });
  if (!result.ok) {
    if (container && !silent) {
      container.innerHTML = '<div class="admin-empty">' + tpEscape(result.msg || 'Não foi possível carregar os pedidos.') + '</div>';
    }
    return;
  }

  adminSandbox = result.sandbox === true;
  const nextOrders = Array.isArray(result.pedidos) ? result.pedidos : [];
  const changed = JSON.stringify(nextOrders) !== JSON.stringify(adminOrders);
  adminOrders = nextOrders;

  if (!silent || changed) adminRenderOrders();
}

async function adminShowOrderDetails(id) {
  const box = document.getElementById('admin-order-details-' + Number(id));
  if (!box) return;

  if (box.dataset.loaded === '1') {
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    return;
  }

  box.style.display = 'block';
  box.innerHTML = '<div class="admin-empty">Carregando detalhes...</div>';

  const result = await apiCall('/admin/pedidos/' + Number(id) + '/detalhes', { method: 'GET' });
  if (!result.ok) {
    box.innerHTML = '<div class="admin-empty">' + tpEscape(result.msg || 'Não foi possível carregar o pedido.') + '</div>';
    return;
  }

  const pedido = result.pedido || {};
  const usuario = result.usuario || {};
  const endereco = pedido.endereco_entrega || {};
  const itens = Array.isArray(result.itens) ? result.itens : [];

  box.innerHTML =
    '<div class="admin-customer-profile">' +
      '<div><span class="section-label dark-label">CLIENTE</span><h4>' + tpEscape(usuario.username || 'Cliente') + '</h4></div>' +
      '<div class="admin-profile-grid">' +
        '<div><span>ID</span><strong>#' + Number(usuario.id || 0) + '</strong></div>' +
        '<div><span>E-mail</span><strong>' + tpEscape(usuario.email || 'Não informado') + '</strong></div>' +
      '</div>' +
      '<div class="admin-address-block"><span>Endereço de entrega</span><strong>' +
        tpEscape([
          endereco.logradouro,
          endereco.numero,
          endereco.complemento,
          endereco.cidade,
          endereco.estado,
          endereco.cep
        ].filter(Boolean).join(', ') || 'Não informado') +
      '</strong></div>' +
    '</div>' +
    '<div class="admin-order-items-detail">' +
      '<span class="section-label dark-label">ITENS DO PEDIDO</span>' +
      itens.map((item) =>
        '<div class="admin-order-item-detail">' +
          '<div><strong>' + tpEscape(item.nome || 'Produto') + '</strong><small>' + tpEscape(item.sku || '') + '</small></div>' +
          '<span>' + Number(item.quantidade || 0) + ' × ' + adminMoney(item.preco_unitario) + '</span>' +
        '</div>'
      ).join('') +
    '</div>';

  box.dataset.loaded = '1';
}

async function adminChangeOrderStatus(id, status) {
  if (!status) return;

  const result = await apiCall('/admin/pedidos/' + Number(id) + '/status', {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });

  if (!result.ok) return showError(result.msg || 'Não foi possível atualizar o pedido.');
  showSuccess('Andamento do pedido atualizado.');
  await Promise.all([adminLoadOrders(), adminLoadSummary()]);
}

async function adminConfirmPayment(id) {
  showConfirm(
    'Confirmar o pagamento do pedido #' + id + ' no Asaas Sandbox? Esta ação simula o pagamento e o Webhook fará a atualização do status.',
    async () => {
      const result = await apiCall('/admin/pedidos/' + Number(id) + '/confirmar-pagamento', {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (!result.ok) return showError(result.msg || 'Não foi possível confirmar o pagamento.');
      showSuccess(result.msg || 'Pagamento confirmado no Sandbox.');
      setTimeout(() => adminLoadOrders({ silent: true }), 1200);
    },
    null,
    'Confirmar pagamento'
  );
}

async function adminRefundOrder(id) {
  showConfirm(
    'Deseja solicitar o estorno integral do pedido #' + id + '? O valor será devolvido pelo Asaas e o estoque será restaurado.',
    async () => {
      const result = await apiCall('/admin/pedidos/' + Number(id) + '/estornar', {
        method: 'POST',
        body: JSON.stringify({
          motivo: 'Estorno integral solicitado pelo administrador do Tech Peças.'
        })
      });

      if (!result.ok) return showError(result.msg || 'Não foi possível solicitar o estorno.');
      showSuccess(result.msg || 'Estorno solicitado.');
      await Promise.all([adminLoadOrders(), adminLoadSummary()]);
    },
    null,
    'Estornar pedido'
  );
}

async function adminCancelOrder(id) {
  showConfirm(
    'Deseja cancelar o pedido #' + id + '? A cobrança pendente será removida do Asaas e o estoque reservado será devolvido.',
    async () => {
      const result = await apiCall('/admin/pedidos/' + Number(id) + '/cancelar', {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (!result.ok) return showError(result.msg || 'Não foi possível cancelar o pedido.');
      showSuccess(result.msg || 'Pedido cancelado.');
      await Promise.all([adminLoadOrders(), adminLoadSummary()]);
    },
    null,
    'Cancelar pedido'
  );
}

function adminStartOrdersPolling() {
  if (adminOrdersPollTimer) clearInterval(adminOrdersPollTimer);

  adminOrdersPollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      adminLoadOrders({ silent: true });
    }
  }, 5000);
}

function adminInitSidebarNavigation() {
  const links = Array.from(document.querySelectorAll('.admin-sidebar-nav a[href^="#"]'));
  if (!links.length) return;

  links.forEach((link) => {
    link.addEventListener('click', () => {
      links.forEach((item) => item.classList.remove('active'));
      link.classList.add('active');
    });
  });

  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if (!sections.length || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;

    const activeLink = links.find((link) => link.getAttribute('href') === '#' + visible.target.id);
    if (!activeLink) return;

    links.forEach((item) => item.classList.remove('active'));
    activeLink.classList.add('active');
  }, {
    rootMargin: '-110px 0px -55% 0px',
    threshold: [0.1, 0.3, 0.6]
  });

  sections.forEach((section) => observer.observe(section));
}

async function adminBoot() {
  const content = document.getElementById('adminContent');
  const blocked = document.getElementById('adminBlocked');
  if (!content || !blocked) return;

  const user = getCurrentUser();
  if (!user || user.papel !== 'admin' || !user.token) {
    blocked.style.display = 'grid';
    content.style.display = 'none';
    return;
  }

  const validation = await apiCall('/admin/me', { method: 'GET' });
  if (!validation.ok) {
    blocked.style.display = 'grid';
    content.style.display = 'none';
    return;
  }

  blocked.style.display = 'none';
  content.style.display = 'grid';

  const identity = document.getElementById('adminIdentity');
  if (identity) {
    identity.innerHTML = '<span>Administrador</span><strong>' + tpEscape(validation.admin?.username || user.username) + '</strong>';
  }

  const loaders = [];

  if (document.getElementById('adminStats')) {
    loaders.push(adminLoadSummary());
  }

  if (document.getElementById('adminProductsList')) {
    loaders.push(adminLoadProducts());
  }

  if (document.getElementById('adminOrdersList')) {
    loaders.push(adminLoadOrders());
  }

  await Promise.all(loaders);

  if (document.getElementById('adminOrdersList')) {
    adminStartOrdersPolling();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  adminInitSidebarNavigation();
  adminBoot();

  document.getElementById('adminProductForm')?.addEventListener('submit', adminSaveProduct);
  document.getElementById('adminNewProduct')?.addEventListener('click', () => {
    adminResetForm();
    document.querySelector('.admin-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('adminCancelEdit')?.addEventListener('click', adminResetForm);
  document.getElementById('adminProductSearch')?.addEventListener('input', (event) => {
    adminRenderProducts(event.target.value);
  });
  document.getElementById('adminRefreshOrders')?.addEventListener('click', adminLoadOrders);

  document.getElementById('adminProductsList')?.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-admin-edit]');
    if (edit) return adminEditProduct(Number(edit.dataset.adminEdit));

    const toggle = event.target.closest('[data-admin-toggle]');
    if (toggle) return adminToggleProduct(Number(toggle.dataset.adminToggle), Number(toggle.dataset.next));

    const remove = event.target.closest('[data-admin-delete]');
    if (remove) return adminDeleteProduct(Number(remove.dataset.adminDelete));
  });

  document.getElementById('adminOrdersList')?.addEventListener('change', (event) => {
    const select = event.target.closest('[data-order-status]');
    if (!select) return;
    adminChangeOrderStatus(Number(select.dataset.orderStatus), select.value);
  });

  document.getElementById('adminOrdersList')?.addEventListener('click', (event) => {
    const details = event.target.closest('[data-admin-order-details]');
    if (details) return adminShowOrderDetails(Number(details.dataset.adminOrderDetails));

    const confirmPayment = event.target.closest('[data-admin-confirm-payment]');
    if (confirmPayment) return adminConfirmPayment(Number(confirmPayment.dataset.adminConfirmPayment));

    const refund = event.target.closest('[data-admin-refund]');
    if (refund) return adminRefundOrder(Number(refund.dataset.adminRefund));

    const cancel = event.target.closest('[data-admin-cancel]');
    if (cancel) return adminCancelOrder(Number(cancel.dataset.adminCancel));
  });
});