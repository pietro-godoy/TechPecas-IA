const API_BASE_URL = window.API_CONFIG?.API_BASE_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:3000/api`
    : `${window.location.protocol}//${window.location.hostname}/api`);

const USER_KEY = "techpecas_user";

function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(userData) {
  if (!userData || !userData.id || !userData.username) return;
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: userData.id,
    username: userData.username,
    papel: userData.papel || 'cliente',
    token: userData.token || null
  }));
}

function logoutCurrentUser() {
  localStorage.removeItem(USER_KEY);
}

async function apiCall(endpoint, options = {}) {
  const user = getCurrentUser();
  const headers = {
    'Content-Type': 'application/json',
    ...(user?.token ? { Authorization: 'Bearer ' + user.token } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return { ok: false, msg: 'Erro ao conectar com o servidor' };
  }
}

async function registerUser(username, password, email = '') {
  if (!username || username.trim().length < 3) {
    return { ok: false, msg: 'Usuário deve ter no mínimo 3 caracteres' };
  }
  if (!password || password.length < 6) {
    return { ok: false, msg: 'Senha deve ter no mínimo 6 caracteres' };
  }

  const result = await apiCall('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password, email: email.trim() })
  });

  if (result.ok && result.usuario) {
    setCurrentUser(result.usuario);
  }

  return result;
}

async function loginUser(username, password) {
  if (!username || !password) {
    return { ok: false, msg: 'Usuário e senha são obrigatórios' };
  }

  const result = await apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password })
  });

  if (result.ok && result.usuario) {
    setCurrentUser(result.usuario);
  }

  return result;
}

async function getSearchHistory() {
  const user = getCurrentUser();
  if (!user) return [];

  const url = `${API_BASE_URL}/historico?usuarioId=${user.id}`;
  console.log('Fetching history from:', url);
  const result = await apiCall(`/historico?usuarioId=${user.id}`, { method: 'GET' });
  
  console.log('History result:', result);
  if (!result.ok) return [];
  
  return result.historico || [];
}

async function addSearchFor(termo) {
  if (!termo || !termo.trim()) {
    return { ok: false, msg: 'Termo inválido' };
  }

  const user = getCurrentUser();
  if (!user) {
    return { ok: false, msg: 'Não autenticado' };
  }

  const result = await apiCall('/historico', {
    method: 'POST',
    body: JSON.stringify({ usuarioId: user.id, termo: termo.trim() })
  });
  
  return result;
}

async function clearHistoryFor() {
  const user = getCurrentUser();
  if (!user) {
    return { ok: false, msg: 'Não autenticado' };
  }

  const result = await apiCall('/historico', { method: 'DELETE', body: JSON.stringify({ usuarioId: user.id }) });
  
  return result;
}

document.addEventListener("DOMContentLoaded", () => {
  const current = getCurrentUser();
  const currentUsername = current?.username || null;

  if (current?.papel === 'admin') {
    const navAuthTarget = document.getElementById('navAuth');
    const nav = navAuthTarget?.parentElement;
    if (nav && !nav.querySelector('.admin-nav-link')) {
      const adminLink = document.createElement('a');
      adminLink.href = 'admin.html';
      adminLink.className = 'admin-nav-link';
      adminLink.textContent = 'Admin';
      nav.insertBefore(adminLink, navAuthTarget);
    }
  }
  
  // Verificar se está na página de busca e se não está logado
  const searchContent = document.getElementById("searchContent");
  const loginRequired = document.getElementById("loginRequired");
  
  if (searchContent && loginRequired) {
    // Página de busca detectada
    if (!currentUsername) {
      // Usuário não está logado - mostrar tela de login
      loginRequired.style.display = "flex";
      searchContent.style.display = "none";
      return;
    } else {
      // Usuário está logado - mostrar conteúdo
      loginRequired.style.display = "none";
      searchContent.style.display = "block";
    }
  }
  
  // Gerenciar navbar (login/logout)
  const navAuth = document.getElementById("navAuth");
  if (navAuth) {
    if (currentUsername) {
      // Usuário logado - mostrar nome e botão de sair
      navAuth.innerHTML = `
        <span class="nav-user">${currentUsername}</span>
        <button id="navLogout" class="nav-logout">Sair</button>
      `;
      
      const navLogout = document.getElementById("navLogout");
      if (navLogout) {
        navLogout.addEventListener("click", () => {
          logoutCurrentUser();
          showSuccess("Você saiu da conta com sucesso!", "Até logo!", () => {
            window.location.href = "index.html";
          });
        });
      }
    } else {
      // Usuário não logado - mostrar link de login
      navAuth.innerHTML = `<a href="login.html" id="nav-login">Fazer Login</a>`;
    }
  }

  // Controlar botão "Buscar Peças" - requer login
  const btnBuscar = document.getElementById("btnBuscar");
  if (btnBuscar) {
    btnBuscar.addEventListener("click", (e) => {
      if (!currentUsername) {
        e.preventDefault();
        showWarning("Você precisa estar logado para buscar peças. Faça login ou cadastre-se.", "Login Necessário");
        return false;
      }
    });
  }

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const toggleBtn = document.getElementById("toggleBtn");
  const formTitle = document.getElementById("formTitle");
  const toggleText = document.getElementById("toggleText");
  const authMsg = document.getElementById("authMsg");

  // Campos de login
  const loginUserInput = document.getElementById("loginUser");
  const loginPassInput = document.getElementById("loginPass");

  // Campos de cadastro
  const registerUsername = document.getElementById("registerUsername");
  const registerEmail = document.getElementById("registerEmail");
  const registerPass = document.getElementById("registerPass");
  const registerPassConfirm = document.getElementById("registerPassConfirm");

  let modeRegister = false;

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      modeRegister = !modeRegister;
      if (modeRegister) {
        formTitle.textContent = "Cadastre-se";
        toggleBtn.textContent = "Já tenho conta";
        toggleText.textContent = "Já tem conta?";
        authMsg.textContent = "";
        loginForm.style.display = "none";
        registerForm.style.display = "flex";
        // Limpar campos
        registerUsername.value = "";
        registerEmail.value = "";
        registerPass.value = "";
        registerPassConfirm.value = "";
        registerUsername.focus();
      } else {
        formTitle.textContent = "Fazer Login";
        toggleBtn.textContent = "Cadastre-se";
        toggleText.textContent = "Não tem conta?";
        authMsg.textContent = "";
        loginForm.style.display = "flex";
        registerForm.style.display = "none";
        // Limpar campos
        loginUserInput.value = "";
        loginPassInput.value = "";
        loginUserInput.focus();
      }
    });
  }

  // Validação de email
  function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  // Formulário de Login
  if (loginForm && loginUserInput && loginPassInput) {
    loginForm.style.display = "flex";
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = loginUserInput.value.trim();
      const password = loginPassInput.value.trim();
      
      if (!username) {
        showWarning("Por favor, insira seu usuário ou email.", "Campo obrigatório");
        loginUserInput.focus();
        return;
      }
      
      if (!password) {
        showWarning("Por favor, insira sua senha.", "Campo obrigatório");
        loginPassInput.focus();
        return;
      }

      const res = await loginUser(username, password);
      if (res.ok) {
        showSuccess("Login realizado com sucesso!", "Bem-vindo!", () => {
          window.location.href = "index.html";
        });
      } else {
        if (res.usuarioNaoExiste) {
          showError("Usuário ou email '" + username + "' não foi encontrado no sistema.", "Não encontrado");
        } else {
          showError(res.msg || "Erro ao fazer login", "Erro no login");
        }
      }
    });
  }

  // Formulário de Cadastro
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = registerUsername.value.trim();
      const email = registerEmail.value.trim();
      const password = registerPass.value;
      const passwordConfirm = registerPassConfirm.value;

      // Validações
      if (!username) {
        showWarning("Por favor, insira um nome de usuário.", "Campo obrigatório");
        registerUsername.focus();
        return;
      }

      if (username.length < 3) {
        showWarning("O nome de usuário deve ter no mínimo 3 caracteres.", "Nome de usuário curto");
        registerUsername.focus();
        return;
      }

      if (!email) {
        showWarning("Por favor, insira seu email.", "Campo obrigatório");
        registerEmail.focus();
        return;
      }

      if (!isValidEmail(email)) {
        showWarning("Por favor, insira um email válido.", "Email inválido");
        registerEmail.focus();
        return;
      }

      if (!password) {
        showWarning("Por favor, insira uma senha.", "Campo obrigatório");
        registerPass.focus();
        return;
      }

      if (password.length < 6) {
        showWarning("A senha deve ter no mínimo 6 caracteres.", "Senha curta");
        registerPass.focus();
        return;
      }

      if (!passwordConfirm) {
        showWarning("Por favor, confirme sua senha.", "Campo obrigatório");
        registerPassConfirm.focus();
        return;
      }

      if (password !== passwordConfirm) {
        showWarning("As senhas não conferem. Por favor, tente novamente.", "Senhas diferentes");
        registerPass.value = "";
        registerPassConfirm.value = "";
        registerPass.focus();
        return;
      }

      // Chamar função de registro
      const res = await registerUser(username, password, email);
      if (res.ok) {
        showSuccess("Cadastro realizado com sucesso! Você foi logado automaticamente.", "Bem-vindo!", () => {
          window.location.href = "buscar.html";
        });
      } else {
        showError(res.msg || "Erro ao cadastrar", "Erro no cadastro");
      }
    });
  }

  const buscaForm = document.getElementById("buscaForm");
  const modeloInput = document.getElementById("modelo");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistory");
  const userArea = document.getElementById("userArea");

  async function renderHistoryFor() {
    if (!historyList) {
      console.log('historyList element not found');
      return;
    }
    historyList.innerHTML = "";
    
    if (!currentUsername) {
      console.log('No current user');
      historyList.innerHTML = '<li style="background:transparent;color:#666;text-align:center;padding:1rem;">Faça login para salvar seu histórico.</li>';
      if (clearHistoryBtn) clearHistoryBtn.style.display = 'none';
      return;
    }

    const buscas = await getSearchHistory();
    console.log('Retrieved searches:', buscas);
    if (buscas.length === 0) {
      historyList.innerHTML = '<li style="background:transparent;color:#999;text-align:center;padding:1rem;font-style:italic;">Nenhuma busca ainda.</li>';
      if (clearHistoryBtn) clearHistoryBtn.style.display = 'none';
      return;
    }

    buscas.forEach((item) => {
      const d = new Date(item.data_busca);
      const li = document.createElement("li");
      li.innerHTML = `<span>${item.termo}</span><span style="font-size:0.8rem;opacity:0.85">${d.toLocaleString()}</span>`;
      li.addEventListener("click", () => {
        modeloInput.value = item.termo;
      });
      historyList.appendChild(li);
    });

    // Mostrar botão "Limpar histórico" apenas se houver buscas
    if (clearHistoryBtn) {
      clearHistoryBtn.style.display = 'block';
    }
  }

  if (userArea) {
    if (currentUsername) {
      userArea.innerHTML = `<div class="user-pill"><span>${currentUsername}</span><button id="btnLogout2" type="button">Sair</button></div>`;
      const btnLogout2 = document.getElementById("btnLogout2");
      btnLogout2.addEventListener("click", () => {
        logoutCurrentUser();
        showSuccess("Você saiu da conta com sucesso!", "Logout", () => {
          window.location.href = "index.html";
        });
      });
    } else {
      userArea.innerHTML = '<div style="font-size:0.95rem;opacity:0.95">Você não está logado. <a href="login.html" style="color: #ffd; text-decoration:underline;">Entrar / Cadastar</a></div>';
    }
  }

  if (buscaForm) {
    renderHistoryFor();

    buscaForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const termo = modeloInput.value.trim();
      if (!termo) {
        showWarning("Digite o modelo e ano do veículo.", "Campo obrigatório");
        return;
      }

      if (currentUsername) {
        await addSearchFor(termo);
        renderHistoryFor();
      }

      // Mostrar loading
      const loadingSpinner = document.getElementById('loadingSpinner');
      if (loadingSpinner) loadingSpinner.style.display = 'flex';
      
      const result = await buscarPecasComChatGPT(termo);
      
      // Ocultar loading
      if (loadingSpinner) loadingSpinner.style.display = 'none';
      
      if (result.ok && result.pecas) {
        exibirPecas(result.pecas, result.carro);
        modeloInput.value = "";
      } else {
        // Quando há erro, não renderiza nada - apenas mostra mensagem de erro
        showError(result.msg || "Erro ao buscar peças", "Erro na busca");
        const pecasComponent = document.getElementById('pecasComponent');
        if (pecasComponent) pecasComponent.style.display = 'none';
        return;
      }
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", async () => {
      if (!currentUsername) {
        showWarning("Faça login para limpar o histórico.", "Não autenticado");
        return;
      }
      showConfirm(
        "Deseja realmente limpar seu histórico de buscas? Esta ação não pode ser desfeita.",
        async () => {
          await clearHistoryFor();
          renderHistoryFor();
          showSuccess("Histórico limpo com sucesso!", "Concluído");
        },
        null,
        "Limpar histórico?"
      );
    });
  }

  const btnClosePecas = document.getElementById("btnClosePecas");
  if (btnClosePecas) {
    btnClosePecas.addEventListener("click", () => {
      const pecasComponent = document.getElementById('pecasComponent');
      if (pecasComponent) {
        pecasComponent.style.display = 'none';
        modeloInput.value = "";
        modeloInput.focus();
      }
    });
  }
});

async function buscarPecasComChatGPT(carroNome) {
  if (!carroNome || carroNome.trim().length === 0) {
    return { ok: false, msg: 'Digite o nome do carro' };
  }

  try {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const pecasContainer = document.getElementById('pecasContainer');
    if (loadingSpinner) loadingSpinner.style.display = 'flex';
    if (pecasContainer) pecasContainer.innerHTML = '';

    const result = await apiCall('/pecas/buscar', {
      method: 'POST',
      body: JSON.stringify({ carroNome: carroNome.trim() })
    });
    
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    
    return result;
  } catch (error) {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    
    return { ok: false, msg: 'Erro ao buscar peças' };
  }
}

function exibirPecas(pecas, carroNome) {
  const container = document.getElementById('pecasContainer');
  const pecasComponent = document.getElementById('pecasComponent');
  
  if (!container || !pecasComponent) return;

  if (!pecas || pecas.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Nenhuma peça encontrada</p>';
    pecasComponent.style.display = 'block';
    return;
  }

  let html = `
    <div style="margin-bottom: 30px;">
      <h2 style="margin: 0 0 5px 0; font-size: 28px; color: #333;">Peças para ${carroNome}</h2>
      <p style="color: #999; margin: 0; font-size: 14px;">Principais peças de manutenção recomendadas</p>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px;">
  `;

  pecas.forEach((peca, index) => {
    html += `
      <div style="
        background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
        border: 1px solid #e0e0e0;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
      " 
      onmouseover="this.style.boxShadow='0 8px 24px rgba(0, 0, 0, 0.12)'; this.style.transform='translateY(-4px)'"
      onmouseout="this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.08)'; this.style.transform='translateY(0)'">
        <div style="
          background: linear-gradient(135deg, var(--vermelho) 0%, #d63031 100%);
          padding: 16px;
          color: white;
        ">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="
              background: rgba(255,255,255,0.3);
              padding: 4px 10px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: bold;
            ">#${index + 1}</span>
            <span style="font-size: 12px; opacity: 0.9;">Peça essencial</span>
          </div>
          <h3 style="margin: 0; font-size: 18px; font-weight: 700;">${peca.nome}</h3>
        </div>
        
        <div style="padding: 16px; flex-grow: 1; display: flex; flex-direction: column;">
          <p style="
            margin: 0 0 16px 0;
            color: #666;
            font-size: 13px;
            line-height: 1.5;
          ">${peca.descricao}</p>
          
          <div style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <p style="margin: 0 0 4px 0; color: #999; font-size: 12px;">Preço médio</p>
              <span style="
                font-size: 24px;
                font-weight: 700;
                color: var(--vermelho);
                background: linear-gradient(135deg, var(--vermelho), #d63031);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
              ">R$ ${peca.preco_medio?.toFixed(2) || '0.00'}</span>
            </div>
            <button 
              onclick="adicionarAoCarrinho(${peca.id}, '${peca.nome}')" 
              style="
                padding: 10px 16px;
                background: linear-gradient(135deg, var(--vermelho) 0%, #d63031 100%);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                font-size: 12px;
                transition: all 0.3s ease;
              "
              onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(220, 48, 49, 0.4)'"
              onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
            >
              + Adicionar
            </button>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
  pecasComponent.style.display = 'block';
}

function adicionarAoCarrinho(id, nome) {
  showSuccess(`${nome} adicionado ao carrinho!`, 'Sucesso');
}


/* ===== TECH PECAS - FLUXO DE BUSCA ===== */
function tpEscape(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function tpMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return '—';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function tpLoading(visible, message) {
  const box = document.getElementById('loadingSpinner');
  if (!box) return;
  const p = box.querySelector('p');
  if (p && message) p.textContent = message;
  box.style.display = visible ? 'flex' : 'none';
}

function tpShowResult(html) {
  const area = document.getElementById('resultadoArea');
  if (!area) return;
  area.innerHTML = html;
  area.style.display = 'block';
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tpRenderDiagnosis(result) {
  const analysis = result.analise || {};
  const vehicle = result.veiculo || {};
  const components = Array.isArray(analysis.componentes) ? analysis.componentes : [];

  const cards = components.map(function(item, index) {
    const term = Array.isArray(item.termos_busca) && item.termos_busca.length
      ? item.termos_busca[0]
      : (item.nome || '');
    return '<article class="diagnostic-card">' +
      '<div class="diagnostic-number">' + (index + 1) + '</div>' +
      '<div><h3>' + tpEscape(item.nome || 'Componente') + '</h3>' +
      '<p>' + tpEscape(item.motivo || 'Pode estar relacionado ao sintoma informado.') + '</p>' +
      '<button class="link-button tp-suggested-part" type="button" data-term="' + tpEscape(term) + '">Pesquisar esta peça →</button></div>' +
      '</article>';
  }).join('');

  tpShowResult(
    '<div class="result-header">' +
      '<span class="section-label dark-label">PEÇAS RELACIONADAS</span>' +
      '<h2>' + tpEscape(vehicle.marca || '') + ' ' + tpEscape(vehicle.modelo || '') + ' ' + tpEscape(vehicle.ano || '') + ' ' + tpEscape(vehicle.versao || '') + '</h2>' +
      '<p>' + tpEscape(analysis.resumo || 'Veja os componentes que podem estar relacionados ao problema informado.') + '</p>' +
    '</div>' +
    '<div class="safety-note"><strong>Importante:</strong> ' +
      tpEscape(analysis.orientacao || 'Confirme a causa do problema com um profissional antes de substituir componentes.') +
    '</div>' +
    '<div class="diagnostic-list">' + (cards || '<p>Nenhum componente foi sugerido.</p>') + '</div>'
  );
}

function tpRenderExternalOffers(externalResult) {
  if (!externalResult || !externalResult.ok) {
    return '';
  }

  if (externalResult.configured === false) {
    return '<section class="external-results-section">' +
      '<div class="external-section-head"><div><span class="section-label dark-label">OFERTAS EXTERNAS</span>' +
      '<h2>Busca na internet ainda não configurada</h2>' +
      '<p>O sistema já está preparado para pesquisar preços fora do Tech Peças. Falta apenas configurar a chave do provedor de busca no servidor.</p></div></div>' +
      '</section>';
  }

  const products = Array.isArray(externalResult.products) ? externalResult.products : [];
  if (!products.length) {
    return '<section class="external-results-section">' +
      '<div class="external-section-head"><div><span class="section-label dark-label">OFERTAS EXTERNAS</span>' +
      '<h2>Nenhuma oferta externa encontrada</h2>' +
      '<p>Tente usar um nome de peça mais específico ou revisar os dados do veículo.</p></div></div>' +
      '</section>';
  }

  const cards = products.map(function(product, index) {
    const targetId = 'external-stores-' + index + '-' + String(product.productId || 'item').replace(/[^a-zA-Z0-9_-]/g, '');
    const image = /^https?:\/\//i.test(product.thumbnail || '') ? product.thumbnail : '';
    const productLink = /^https?:\/\//i.test(product.productLink || '') ? product.productLink : '';
    const ratingText = product.rating !== null
      ? product.rating.toFixed(1) + '/5' + (product.reviews ? ' · ' + Number(product.reviews).toLocaleString('pt-BR') + ' avaliações' : '')
      : 'Sem avaliações disponíveis';

    return '<article class="external-offer-card">' +
      '<div class="external-product-media">' +
        (image ? '<img src="' + tpEscape(image) + '" alt="" loading="lazy">' : '<div class="external-image-placeholder">TP</div>') +
      '</div>' +
      '<div class="external-product-body">' +
        '<div class="external-source-row">' +
          '<span class="external-source">' + tpEscape(product.source || 'Loja externa') + '</span>' +
          (product.tag ? '<span class="external-tag">' + tpEscape(product.tag) + '</span>' : '') +
        '</div>' +
        '<h3>' + tpEscape(product.title || 'Produto') + '</h3>' +
        '<p class="external-rating">' + tpEscape(ratingText) + '</p>' +
        '<div class="external-price-row">' +
          '<strong>' + tpEscape(product.price || 'Preço não informado') + '</strong>' +
          (product.oldPrice ? '<span>' + tpEscape(product.oldPrice) + '</span>' : '') +
        '</div>' +
        (product.delivery ? '<p class="external-delivery">' + tpEscape(product.delivery) + '</p>' : '') +
        '<div class="external-actions">' +
          (productLink ? '<a class="primary-cta external-buy-link" href="' + tpEscape(productLink) + '" target="_blank" rel="noopener noreferrer">Ver produto <span>↗</span></a>' : '') +
          ((product.productId || product.pageToken)
            ? '<button type="button" class="secondary-cta button-reset tp-external-stores" ' +
              'data-product-id="' + tpEscape(product.productId || '') + '" ' +
              'data-page-token="' + tpEscape(product.pageToken || '') + '" ' +
              'data-target="' + tpEscape(targetId) + '">Comparar lojas</button>'
            : '') +
        '</div>' +
        '<div id="' + tpEscape(targetId) + '" class="external-stores-list"></div>' +
      '</div>' +
    '</article>';
  }).join('');

  return '<section class="external-results-section">' +
    '<div class="external-section-head">' +
      '<div><span class="section-label dark-label">OFERTAS ENCONTRADAS NA INTERNET</span>' +
      '<h2>Compare antes de comprar</h2>' +
      '<p>Resultados externos para “' + tpEscape(externalResult.query || externalResult.termo || '') + '”. Preços e disponibilidade podem mudar no site da loja.</p></div>' +
      '<span class="external-count">' + products.length + ' opções</span>' +
    '</div>' +
    '<div class="external-offer-grid">' + cards + '</div>' +
  '</section>';
}

function tpRenderParts(result, externalResult) {
  const pieces = result && Array.isArray(result.pecas) ? result.pecas : [];
  const externalProducts = externalResult && Array.isArray(externalResult.products) ? externalResult.products : [];

  let internalHtml = '';

  if (pieces.length) {
    const cards = pieces.map(function(piece, index) {
      const sitePrice = piece.preco_site !== null ? tpMoney(piece.preco_site) : 'Consultar';
      const partnerPrice = piece.menor_preco_parceiro !== null ? tpMoney(piece.menor_preco_parceiro) : 'Sem oferta cadastrada';
      const stock = Number(piece.estoque) || 0;

      return '<article class="part-card">' +
        '<div class="part-card-top"><span class="part-rank">#' + (index + 1) + '</span>' +
        '<span class="stock-chip ' + (stock > 0 ? 'available' : '') + '">' +
        (stock > 0 ? stock + ' em estoque' : 'Sem estoque no site') + '</span></div>' +
        '<h3>' + tpEscape(piece.nome || '') + '</h3>' +
        '<p class="part-meta">' + tpEscape(piece.fabricante || 'Fabricante não informado') + ' · ' + tpEscape(piece.categoria || 'Autopeça') + '</p>' +
        '<p class="part-description">' + tpEscape(piece.descricao || 'Sem descrição cadastrada.') + '</p>' +
        '<div class="price-compare"><div><small>Tech Peças</small><strong>' + sitePrice + '</strong></div>' +
        '<div><small>Parceiros cadastrados</small><strong>' + partnerPrice + '</strong></div></div>' +
        '<div class="part-actions">' +
        (piece.preco_site !== null && stock > 0 ? '<button class="btn-primary small-button" type="button" onclick="showInfo(\'O carrinho será implementado no próximo marco do protótipo.\', \'Compra no site\')">Comprar no site</button>' : '') +
        '<button class="btn-secondary small-button tp-offers" type="button" data-piece-id="' + Number(piece.id) + '">Ver parceiros (' + Number(piece.total_ofertas || 0) + ')</button>' +
        '</div><div id="offers-' + Number(piece.id) + '" class="offers-list"></div></article>';
    }).join('');

    const filterText = result.filtros
      ? 'Compatibilidade filtrada para ' + tpEscape(result.filtros.marca) + ' ' + tpEscape(result.filtros.modelo) + ' ' + tpEscape(result.filtros.ano) + '.'
      : 'Produtos disponíveis no catálogo próprio.';

    internalHtml =
      '<section class="internal-results-section">' +
        '<div class="result-header"><span class="section-label dark-label">NO TECH PEÇAS</span>' +
        '<h2>Nosso catálogo</h2><p>' + filterText + '</p></div>' +
        '<div class="part-grid">' + cards + '</div>' +
      '</section>';
  }

  const externalHtml = tpRenderExternalOffers(externalResult);

  if (!pieces.length && !externalProducts.length && (!externalResult || externalResult.configured !== false)) {
    tpShowResult(
      '<div class="empty-result"><h2>Nenhuma opção encontrada</h2>' +
      '<p>Tente pesquisar pelo nome mais comum da peça ou revisar marca, modelo e ano do veículo.</p></div>'
    );
    return;
  }

  tpShowResult(
    '<div class="result-overview">' +
      '<span class="section-label dark-label">RESULTADOS</span>' +
      '<h2>Resultados para “' + tpEscape((result && result.termo) || (externalResult && externalResult.termo) || '') + '”</h2>' +
      '<p>Comparamos o que existe no Tech Peças com opções encontradas fora da plataforma.</p>' +
    '</div>' +
    internalHtml +
    externalHtml
  );
}

async function tpLoadExternalStores(productId, pageToken, targetId) {
  const container = document.getElementById(targetId);
  if (!container) return;

  container.innerHTML = '<span class="muted-text">Consultando lojas...</span>';

  const result = await apiCall('/ofertas-externas/lojas', {
    method: 'POST',
    body: JSON.stringify({ productId: productId || '', pageToken: pageToken || '' })
  });

  if (!result.ok) {
    container.innerHTML = '<span class="muted-text">Não foi possível consultar outras lojas agora.</span>';
    return;
  }

  const stores = Array.isArray(result.stores) ? result.stores : [];
  if (!stores.length) {
    container.innerHTML = '<span class="muted-text">Não encontramos outros vendedores para este produto.</span>';
    return;
  }

  const sorted = stores.slice().sort(function(a, b) {
    const pa = a.extractedPrice === null ? Number.POSITIVE_INFINITY : Number(a.extractedPrice);
    const pb = b.extractedPrice === null ? Number.POSITIVE_INFINITY : Number(b.extractedPrice);
    return pa - pb;
  });

  container.innerHTML =
    '<div class="external-stores-head"><strong>Lojas encontradas</strong>' +
    (result.priceRange ? '<span>' + tpEscape(result.priceRange) + '</span>' : '') +
    '</div>' +
    sorted.map(function(store, index) {
      const link = /^https?:\/\//i.test(store.link || '') ? store.link : '';
      return '<div class="external-store-row">' +
        '<div class="external-store-rank">' + (index + 1) + '</div>' +
        '<div class="external-store-info"><strong>' + tpEscape(store.name || 'Loja') + '</strong>' +
          (store.tag ? '<small>' + tpEscape(store.tag) + '</small>' : '') +
          (store.shipping ? '<small>' + tpEscape(store.shipping) + '</small>' : '') +
        '</div>' +
        '<div class="external-store-price">' + tpEscape(store.price || store.total || 'Consultar') + '</div>' +
        (link ? '<a href="' + tpEscape(link) + '" target="_blank" rel="noopener noreferrer">Comprar ↗</a>' : '<span class="muted-text">Sem link</span>') +
      '</div>';
    }).join('');
}

async function tpLoadOffers(pieceId) {
  const container = document.getElementById('offers-' + pieceId);
  if (!container) return;
  container.innerHTML = '<span class="muted-text">Carregando ofertas...</span>';

  const result = await apiCall('/pecas/' + pieceId + '/ofertas');
  if (!result.ok || !result.ofertas || !result.ofertas.length) {
    container.innerHTML = '<span class="muted-text">Nenhuma oferta de parceiro cadastrada para esta peça.</span>';
    return;
  }

  container.innerHTML = result.ofertas.map(function(offer) {
    const link = /^https?:\/\//i.test(offer.link_compra || '') ? offer.link_compra : '';
    return '<div class="offer-row"><div><strong>' + tpEscape(offer.fornecedor || '') + '</strong>' +
      '<small>Atualizado em ' + new Date(offer.atualizado_em).toLocaleDateString('pt-BR') + '</small></div>' +
      '<div class="offer-price">' + tpMoney(offer.preco) + '</div>' +
      (link ? '<a href="' + tpEscape(link) + '" target="_blank" rel="noopener noreferrer">Ir para parceiro</a>' : '<span class="muted-text">Sem link</span>') +
      '</div>';
  }).join('');
}

async function tpRenderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  const history = await getSearchHistory();

  if (!history.length) {
    list.innerHTML = '<li class="history-empty">Nenhuma pesquisa salva ainda.</li>';
    return;
  }

  list.innerHTML = history.map(function(item) {
    const label = item.tipo === 'problema' ? 'Sintoma' : (item.tipo === 'peca' ? '🔎 Peça' : '🔍 Busca');
    return '<li><span class="history-type">' + label + '</span>' +
      '<span class="history-term">' + tpEscape(item.termo || '') + '</span>' +
      '<time>' + new Date(item.data_busca).toLocaleString('pt-BR') + '</time></li>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', function() {
  const diagForm = document.getElementById('diagnosticoForm');
  const partForm = document.getElementById('pecaForm');
  if (!diagForm && !partForm) return;

  const modeButtons = document.querySelectorAll('.search-mode');
  modeButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      modeButtons.forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.mode-panel').forEach(function(panel) { panel.classList.remove('active'); });
      button.classList.add('active');
      const target = button.dataset.mode === 'peca' ? document.getElementById('modePeca') : document.getElementById('modeProblema');
      if (target) target.classList.add('active');
    });
  });

  const filter = document.getElementById('usarFiltroVeiculo');
  if (filter) {
    filter.addEventListener('change', function() {
      const fields = document.getElementById('pecaVehicleFields');
      if (fields) fields.style.display = filter.checked ? 'grid' : 'none';
    });
  }

  if (diagForm) {
    diagForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      const user = getCurrentUser();
      if (!user) return showWarning('Faça login para analisar o problema do seu veículo.');

      const payload = {
        usuarioId: user.id,
        marca: document.getElementById('diagMarca').value.trim(),
        modelo: document.getElementById('diagModelo').value.trim(),
        ano: document.getElementById('diagAno').value,
        versao: document.getElementById('diagVersao').value.trim(),
        problema: document.getElementById('diagProblema').value.trim()
      };

      if (!payload.marca || !payload.modelo || !payload.ano || payload.problema.length < 8) {
        return showWarning('Informe marca, modelo, ano e descreva o problema com um pouco mais de detalhe.');
      }

      tpLoading(true, 'Analisando o que pode estar relacionado...');
      const result = await apiCall('/diagnostico/analisar', { method: 'POST', body: JSON.stringify(payload) });
      tpLoading(false);

      if (!result.ok) return showError(result.msg || 'Não foi possível analisar o problema.');
      tpRenderDiagnosis(result);
      tpRenderHistory();
    });
  }

  if (partForm) {
    partForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      const user = getCurrentUser();
      if (!user) return showWarning('Faça login para pesquisar peças.');

      const useFilter = document.getElementById('usarFiltroVeiculo').checked;
      const payload = {
        usuarioId: user.id,
        termo: document.getElementById('pecaTermo').value.trim(),
        marca: useFilter ? document.getElementById('pecaMarca').value.trim() : '',
        modelo: useFilter ? document.getElementById('pecaModelo').value.trim() : '',
        ano: useFilter ? document.getElementById('pecaAno').value : ''
      };

      if (payload.termo.length < 2) return showWarning('Digite o nome da peça que deseja pesquisar.');
      if (useFilter && (!payload.marca || !payload.modelo || !payload.ano)) {
        return showWarning('Para filtrar por veículo, informe marca, modelo e ano.');
      }

      tpLoading(true, 'Procurando no Tech Peças e em lojas externas...');
      const [result, externalResult] = await Promise.all([
        apiCall('/pecas/pesquisar', { method: 'POST', body: JSON.stringify(payload) }),
        apiCall('/ofertas-externas/pesquisar', { method: 'POST', body: JSON.stringify(payload) })
      ]);
      tpLoading(false);

      if (!result.ok && !externalResult.ok) {
        return showError('Não foi possível concluir a pesquisa agora.');
      }

      tpRenderParts(
        result.ok ? result : { ok: true, termo: payload.termo, filtros: null, pecas: [] },
        externalResult.ok ? externalResult : { ok: true, termo: payload.termo, configured: true, products: [] }
      );
      tpRenderHistory();
    });
  }

  const resultArea = document.getElementById('resultadoArea');
  if (resultArea) {
    resultArea.addEventListener('click', function(event) {
      const suggested = event.target.closest('.tp-suggested-part');
      if (suggested) {
        const term = suggested.dataset.term || '';
        const partTab = document.querySelector('[data-mode="peca"]');
        if (partTab) partTab.click();
        const input = document.getElementById('pecaTermo');
        if (input) { input.value = term; input.focus(); }
        return;
      }

      const externalStores = event.target.closest('.tp-external-stores');
      if (externalStores) {
        tpLoadExternalStores(
          externalStores.dataset.productId || '',
          externalStores.dataset.pageToken || '',
          externalStores.dataset.target || ''
        );
        return;
      }

      const offers = event.target.closest('.tp-offers');
      if (offers) tpLoadOffers(Number(offers.dataset.pieceId));
    });
  }

  tpRenderHistory();
});


/* ===== TECH PECAS - GARAGEM ===== */
function tpVehicleQueryString(vehicle) {
  const params = new URLSearchParams();
  if (vehicle.marca) params.set('marca', vehicle.marca);
  if (vehicle.modelo) params.set('modelo', vehicle.modelo);
  if (vehicle.ano) params.set('ano', vehicle.ano);
  if (vehicle.versao) params.set('versao', vehicle.versao);
  return params.toString();
}

async function tpLoadGarage() {
  const user = getCurrentUser();
  const list = document.getElementById('garageList');
  if (!user || !list) return;

  list.innerHTML = '<div class="garage-empty">Carregando seus veículos...</div>';
  const result = await apiCall('/veiculos?usuarioId=' + encodeURIComponent(user.id));

  if (!result.ok) {
    list.innerHTML = '<div class="garage-empty">Não foi possível carregar sua garagem.</div>';
    return;
  }

  const vehicles = Array.isArray(result.veiculos) ? result.veiculos : [];
  if (!vehicles.length) {
    list.innerHTML = '<div class="garage-empty">Você ainda não salvou nenhum veículo.</div>';
    return;
  }

  list.innerHTML = vehicles.map(function(vehicle) {
    return '<article class="garage-card">' +
      '<div class="garage-card-icon">🚘</div>' +
      '<div class="garage-card-body">' +
        '<span class="garage-card-year">' + tpEscape(vehicle.ano || '') + '</span>' +
        '<h3>' + tpEscape(vehicle.marca || '') + ' ' + tpEscape(vehicle.modelo || '') + '</h3>' +
        '<p>' + tpEscape(vehicle.versao || 'Versão não informada') + '</p>' +
      '</div>' +
      '<div class="garage-card-actions">' +
        '<button type="button" class="btn-primary small-button tp-use-vehicle" ' +
          'data-marca="' + tpEscape(vehicle.marca || '') + '" ' +
          'data-modelo="' + tpEscape(vehicle.modelo || '') + '" ' +
          'data-ano="' + tpEscape(vehicle.ano || '') + '" ' +
          'data-versao="' + tpEscape(vehicle.versao || '') + '">Usar este carro</button>' +
        '<button type="button" class="garage-delete tp-delete-vehicle" data-id="' + Number(vehicle.id) + '">Remover</button>' +
      '</div>' +
    '</article>';
  }).join('');
}

function tpPrefillSearchFromVehicle() {
  const params = new URLSearchParams(window.location.search);
  const marca = params.get('marca') || '';
  const modelo = params.get('modelo') || '';
  const ano = params.get('ano') || '';
  const versao = params.get('versao') || '';
  if (!marca && !modelo && !ano && !versao) return;

  const diagMarca = document.getElementById('diagMarca');
  const diagModelo = document.getElementById('diagModelo');
  const diagAno = document.getElementById('diagAno');
  const diagVersao = document.getElementById('diagVersao');

  if (diagMarca) diagMarca.value = marca;
  if (diagModelo) diagModelo.value = modelo;
  if (diagAno) diagAno.value = ano;
  if (diagVersao) diagVersao.value = versao;

  const filter = document.getElementById('usarFiltroVeiculo');
  const fields = document.getElementById('pecaVehicleFields');
  const pecaMarca = document.getElementById('pecaMarca');
  const pecaModelo = document.getElementById('pecaModelo');
  const pecaAno = document.getElementById('pecaAno');

  if (filter) filter.checked = true;
  if (fields) fields.style.display = 'grid';
  if (pecaMarca) pecaMarca.value = marca;
  if (pecaModelo) pecaModelo.value = modelo;
  if (pecaAno) pecaAno.value = ano;
}

document.addEventListener('DOMContentLoaded', function() {
  tpPrefillSearchFromVehicle();

  const userArea = document.getElementById('userArea');
  const user = getCurrentUser();
  if (userArea && user) {
    const garageLink = document.createElement('a');
    garageLink.href = 'garagem.html';
    garageLink.className = 'garage-pill-link';
    garageLink.textContent = 'Minha garagem';
    userArea.prepend(garageLink);
  }

  const garageContent = document.getElementById('garageContent');
  const garageLoginRequired = document.getElementById('garageLoginRequired');
  if (!garageContent && !garageLoginRequired) return;

  if (!user) {
    if (garageLoginRequired) garageLoginRequired.style.display = 'flex';
    if (garageContent) garageContent.style.display = 'none';
    return;
  }

  if (garageLoginRequired) garageLoginRequired.style.display = 'none';
  if (garageContent) garageContent.style.display = 'block';

  const garageUserArea = document.getElementById('garageUserArea');
  if (garageUserArea) {
    garageUserArea.innerHTML =
      '<div class="user-pill"><span>' + tpEscape(user.username) + '</span>' +
      '<button id="garageLogout" type="button">Sair</button></div>';
    document.getElementById('garageLogout')?.addEventListener('click', function() {
      logoutCurrentUser();
      window.location.href = 'index.html';
    });
  }

  const form = document.getElementById('garageForm');
  if (form) {
    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      const payload = {
        usuarioId: user.id,
        marca: document.getElementById('garageMarca').value.trim(),
        modelo: document.getElementById('garageModelo').value.trim(),
        ano: document.getElementById('garageAno').value,
        versao: document.getElementById('garageVersao').value.trim()
      };

      if (!payload.marca || !payload.modelo || !payload.ano) {
        return showWarning('Informe marca, modelo e ano do veículo.');
      }

      const result = await apiCall('/veiculos', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!result.ok) return showError(result.msg || 'Não foi possível salvar o veículo.');

      form.reset();
      showSuccess('Veículo salvo na sua garagem.', 'Garagem atualizada');
      tpLoadGarage();
    });
  }

  const list = document.getElementById('garageList');
  if (list) {
    list.addEventListener('click', function(event) {
      const useButton = event.target.closest('.tp-use-vehicle');
      if (useButton) {
        const vehicle = {
          marca: useButton.dataset.marca || '',
          modelo: useButton.dataset.modelo || '',
          ano: useButton.dataset.ano || '',
          versao: useButton.dataset.versao || ''
        };
        window.location.href = 'buscar.html?' + tpVehicleQueryString(vehicle);
        return;
      }

      const deleteButton = event.target.closest('.tp-delete-vehicle');
      if (!deleteButton) return;

      const vehicleId = Number(deleteButton.dataset.id);
      showConfirm(
        'Deseja remover este veículo da sua garagem?',
        async function() {
          const result = await apiCall('/veiculos/' + vehicleId, {
            method: 'DELETE',
            body: JSON.stringify({ usuarioId: user.id })
          });

          if (!result.ok) return showError(result.msg || 'Não foi possível remover o veículo.');
          tpLoadGarage();
        },
        null,
        'Remover veículo?'
      );
    });
  }

  tpLoadGarage();
});


/* ===== TECH PECAS - HOME VEHICLE ===== */
async function tpLoadHomeVehicle() {
  const nameEl = document.getElementById('homeVehicleName');
  if (!nameEl) return;

  const user = getCurrentUser();
  if (!user) return;

  const result = await apiCall('/veiculos?usuarioId=' + encodeURIComponent(user.id), { method: 'GET' });
  if (!result.ok || !Array.isArray(result.veiculos) || !result.veiculos.length) return;

  const vehicle = result.veiculos[0];
  const labelEl = document.getElementById('homeVehicleLabel');
  const statusEl = document.getElementById('homeVehicleStatus');
  const brandEl = document.getElementById('homeVehicleBrand');
  const versionEl = document.getElementById('homeVehicleVersion');

  if (labelEl) labelEl.textContent = 'SEU VEÍCULO';
  if (statusEl) statusEl.textContent = 'Salvo';
  if (brandEl) brandEl.textContent = vehicle.marca || 'Meu veículo';

  const model = vehicle.modelo || 'Veículo';
  const year = vehicle.ano ? ' ' + vehicle.ano : '';
  nameEl.textContent = model + year;

  if (versionEl) {
    versionEl.textContent = vehicle.versao || 'Versão não informada';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  tpLoadHomeVehicle();
});
