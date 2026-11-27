// Criar overlay do modal se não existir
function ensureModalOverlay() {
  if (document.getElementById('modalOverlay')) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'modalOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div id="modalContent" class="modal"></div>';
  document.body.appendChild(overlay);
}

// Fechar modal
function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// Mostrar modal com conteúdo customizado
function modalEscape(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function showModal(title, message, type = 'info', buttons = [], onClose = null) {
  ensureModalOverlay();
  
  const overlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  
  // Limpar classe de tipo anterior
  modalContent.className = `modal modal-${type}`;
  
  let html = `
    <div class="modal-header">
      <h3>${modalEscape(title)}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p>${modalEscape(message)}</p>
    </div>
  `;
  
  if (buttons.length > 0) {
    html += '<div class="modal-footer">';
    buttons.forEach(btn => {
      html += `<button class="modal-btn ${btn.class}" onclick="handleModalButton('${btn.action}')">${modalEscape(btn.text)}</button>`;
    });
    html += '</div>';
  }
  
  modalContent.innerHTML = html;
  window._modalOnClose = onClose;
  overlay.classList.add('active');
  
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeModal();
      if (onClose) onClose();
    }
  };
}

// Manipulador para ações dos botões do modal
window.handleModalButton = function(action) {
  const confirmCallback = window._modalConfirmCallback;
  const cancelCallback = window._modalCancelCallback;
  
  // Limpar callbacks imediatamente antes de executar
  window._modalConfirmCallback = null;
  window._modalCancelCallback = null;
  
  closeModal();
  
  // Executar callback APÓS fechar modal
  if (action === 'confirm' && confirmCallback) {
    confirmCallback();
  } else if (action === 'cancel' && cancelCallback) {
    cancelCallback();
  }
};

// Mensagem de sucesso
function showSuccess(message, title = '✓ Sucesso', callback = null) {
  showModal(
    title || '✓ Sucesso',
    message,
    'success',
    [{ text: 'OK', class: 'modal-btn-primary', action: 'confirm' }],
    callback
  );
  if (callback) {
    window._modalConfirmCallback = callback;
  }
}

// Mensagem de erro
function showError(message, title = '✗ Erro', callback = null) {
  window._modalConfirmCallback = null;
  window._modalCancelCallback = null;
  showModal(
    title || '✗ Erro',
    message,
    'error',
    [{ text: 'OK', class: 'modal-btn-primary', action: 'confirm' }],
    callback
  );
  
  if (callback) {
    window._modalConfirmCallback = callback;
  }
}

// Mensagem de aviso
function showWarning(message, title = '⚠ Aviso', callback = null) {
  window._modalConfirmCallback = null;
  window._modalCancelCallback = null;
  showModal(
    title || '⚠ Aviso',
    message,
    'warning',
    [{ text: 'OK', class: 'modal-btn-primary', action: 'confirm' }],
    callback
  );
  
  if (callback) {
    window._modalConfirmCallback = callback;
  }
}

// Mensagem informativa
function showInfo(message, title = 'ℹ Informação', callback = null) {
  showModal(
    title || 'ℹ Informação',
    message,
    'confirm',
    [{ text: 'OK', class: 'modal-btn-primary', action: 'confirm' }],
    callback
  );
  
  if (callback) {
    window._modalConfirmCallback = callback;
  }
}

// Confirmação
function showConfirm(message, onConfirm, onCancel = null, title = '? Confirmação') {
  window._modalConfirmCallback = onConfirm;
  window._modalCancelCallback = onCancel;
  
  showModal(
    title || '? Confirmação',
    message,
    'confirm',
    [
      { text: 'Cancelar', class: 'modal-btn-secondary', action: 'cancel' },
      { text: 'Confirmar', class: 'modal-btn-confirm', action: 'confirm' }
    ]
  );
}
