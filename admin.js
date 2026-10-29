let adminProducts = [];
let adminOrders = [];

function adminMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function adminStatusLabel(status) {
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
        '</div>' +
        '<p>' + tpEscape(product.fabricante || 'Sem fabricante') + ' · ' + tpEscape(product.categoria || 'Sem categoria') + '</p>' +
        '<div class="admin-product-meta">' +
          '<span>SKU ' + tpEscape(product.sku || '—') + '</span>' +
          '<span>' + Number(product.estoque || 0) + ' em estoque</span>' +
          '<span>' + Number(product.total_compatibilidades || 0) + ' compat.</span>' +
        '</div>' +
      '</div>' +
      '<strong class="admin-product-price">' + (product.preco_site === null ? 'Consultar' : adminMoney(product.preco_site)) + '</strong>' +
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

function adminRenderOrders() {
  const container = document.getElementById('adminOrdersList');
  if (!container) return;

  if (!adminOrders.length) {
    container.innerHTML = '<div class="admin-empty">Nenhum pedido criado ainda.</div>';
    return;
  }

  container.innerHTML = adminOrders.map((order) => {
    return '<article class="admin-order-row">' +
      '<div><span class="order-number">PEDIDO #' + Number(order.id) + '</span><h3>' + tpEscape(order.username || 'Cliente') + '</h3><p>' + tpEscape(order.email || '') + '</p></div>' +
      '<div><span>Itens</span><strong>' + Number(order.total_itens || 0) + '</strong></div>' +
      '<div><span>Total</span><strong>' + adminMoney(order.valor_total) + '</strong></div>' +
      '<div><span>Pagamento</span><strong>' + (order.forma_pagamento === 'pix' ? 'Pix' : 'Cartão') + '</strong></div>' +
      '<label class="admin-order-status">Status' +
        '<select data-order-status="' + Number(order.id) + '">' +
          ['aguardando_pagamento','pago','preparando','enviado','concluido','cancelado']
            .map((status) => '<option value="' + status + '"' + (status === order.status ? ' selected' : '') + '>' + adminStatusLabel(status) + '</option>')
            .join('') +
        '</select>' +
      '</label>' +
    '</article>';
  }).join('');
}

async function adminLoadOrders() {
  const container = document.getElementById('adminOrdersList');
  if (container) container.innerHTML = '<div class="admin-empty">Carregando pedidos...</div>';

  const result = await apiCall('/admin/pedidos', { method: 'GET' });
  if (!result.ok) {
    if (container) container.innerHTML = '<div class="admin-empty">' + tpEscape(result.msg || 'Não foi possível carregar os pedidos.') + '</div>';
    return;
  }

  adminOrders = Array.isArray(result.pedidos) ? result.pedidos : [];
  adminRenderOrders();
}

async function adminChangeOrderStatus(id, status) {
  const result = await apiCall('/admin/pedidos/' + Number(id) + '/status', {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });

  if (!result.ok) return showError(result.msg || 'Não foi possível atualizar o pedido.');
  await Promise.all([adminLoadOrders(), adminLoadSummary()]);
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
  content.style.display = 'block';

  const identity = document.getElementById('adminIdentity');
  if (identity) {
    identity.innerHTML = '<span>Administrador</span><strong>' + tpEscape(validation.admin?.username || user.username) + '</strong>';
  }

  await Promise.all([adminLoadSummary(), adminLoadProducts(), adminLoadOrders()]);
}

document.addEventListener('DOMContentLoaded', () => {
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
});