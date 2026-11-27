document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('productDetail');
  if (!root) return;
  const id = Number(new URLSearchParams(location.search).get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) { root.textContent = 'Produto inválido.'; return; }
  const data = await apiCall('/catalogo/' + id);
  if (!data.ok || !data.produto) { root.textContent = data.msg || 'Produto não encontrado.'; return; }
  const p = data.produto;
  const e = tpEscape;
  const fallback = storeCatalogFallback(p);
  const image = storeSafeImage(p.imagem_url) || fallback;
  const available = p.preco_site !== null && Number(p.estoque) > 0;
  const rows = [['Nome',p.nome],['Fabricante',Number(p.auto_importado)&&p.fabricante==='Linha Tech Peças'?null:p.fabricante],['Categoria',p.categoria],['Código SKU',p.sku]];
  const compat = Array.isArray(data.compatibilidades) ? data.compatibilidades.filter(c=>!String(c.observacao||'').includes('automaticamente a partir da busca')) : [];
  document.title = (p.nome || 'Produto') + ' | Tech Peças';
  const imported=Number(p.auto_importado)===1;
  const manufacturer=imported&&p.fabricante==='Linha Tech Peças'?'Fabricante ainda não identificado':p.fabricante||'Fabricante não informado';
  const price=p.preco_site===null?'Consultar':storeMoney(p.preco_site);
  let technicalRows=[];
  const sourceLinks=v=>[...new Set([...(Array.isArray(v.fontes)?v.fontes:[]),v.fonte].filter(x=>/^https?:\/\//i.test(x||'')))].map((url,i)=>'<a target="_blank" rel="noopener noreferrer" href="'+e(url)+'">Fonte '+(i+1)+'</a>').join(' · ');
  const specTable=items=>'<table class="pd-spec">'+items.map(v=>'<tr><th>'+e(v.campo)+'</th><td>'+e(v.valor||'Não verificado')+(v.valor&&v.fonte?'<small>'+sourceLinks(v)+'</small>':'')+'</td></tr>').join('')+'</table>';
  root.innerHTML='<div class="pd-market"><div class="pd-main"><article class="pd-card pd-grid"><div><div class="pd-media" id="pdMedia"></div><div id="pdThumb"></div><p class="pd-note" id="pdImageNote"></p></div><div><span class="pd-eyebrow">'+e(p.categoria||'Autopeça')+'</span><h1>'+e(p.nome)+'</h1><p>'+e(manufacturer)+'</p><a id="pdRatingLink" href="#pdReviews">Ver avaliações</a><div class="pd-price">'+price+'</div><p class="pd-note">'+(imported?'Produto importado para catálogo de demonstração. Preço e estoque não confirmados pelo fornecedor.':'Consulte as condições de pagamento no checkout.')+'</p><a href="#pdCompatibility">Conferir veículos compatíveis</a><hr><p><strong>Características principais</strong></p><div id="pdHighlights">Carregando características...</div></div></article>'+
  '<section class="pd-card"><h2>Características do produto</h2><div id="pdTechnical">Carregando ficha técnica...</div></section>'+
  '<section class="pd-card"><h2>Descrição e informações gerais</h2><div id="pdGeneralSource">Carregando informações...</div></section>'+
  '<section class="pd-card" id="pdCompatibility"><span class="section-label dark-label">CONFIRA ANTES DE COMPRAR</span><h2>Esta peça serve no meu veículo?</h2><p>Selecione um veículo da garagem ou informe os dados manualmente.</p><label>Minha garagem<select id="pdGarage"><option value="">Informar manualmente</option></select></label><form id="pdVehicleForm"><div class="pd-vehicle-grid"><label>Marca<input id="pdMarca" required placeholder="Ex.: Volkswagen"></label><label>Modelo<input id="pdModelo" required placeholder="Ex.: Gol"></label><label>Ano<input id="pdAno" type="number" min="1950" max="2100" required placeholder="2015"></label></div><button class="primary-cta button-reset">Verificar compatibilidade</button></form><div id="pdVerdict" class="pd-verdict" role="status">Informe seu veículo para consultar as aplicações cadastradas.</div><h3>Aplicações informadas nas fontes</h3><div id="pdSourceApplications">Consultando informações armazenadas...</div><h3>Aplicações cadastradas</h3>'+(compat.length?'<table class="pd-spec">'+compat.map(c=>'<tr><th>'+e(c.marca)+' '+e(c.modelo)+'</th><td>'+e(c.ano_inicio)+'–'+e(c.ano_fim)+' '+e(c.observacao || '')+'</td></tr>').join('')+'</table>':'<p>Compatibilidade ainda não cadastrada. Confirme com o fabricante antes de comprar.</p>')+'</section>'+
  '<section class="pd-card"><h2>Perguntas sobre a peça</h2><p class="pd-note">Consulte a ficha técnica disponível, sem gerar especificações novas.</p><form id="pdQuestionForm" class="pd-question-form"><label>Pergunta<input id="pdQuestion" required maxlength="300" placeholder="Ex.: Qual é o código OEM?"></label><button class="primary-cta button-reset">Perguntar</button></form><div id="pdQuestionAnswer" class="pd-question-answer" role="status"></div></section>'+
  '<section class="pd-card" id="pdReviews"><h2>Avaliações dos clientes</h2><div id="pdReviewList">Carregando avaliações...</div><form id="pdReviewForm"><label>Nota <select id="pdRating" required><option value="">Selecione</option>'+[5,4,3,2,1].map(n=>'<option value="'+n+'">'+n+' de 5 estrelas</option>').join('')+'</select></label><p><label>Comentário <textarea id="pdComment" maxlength="1000" rows="4" style="width:100%" required></textarea></label></p><button class="primary-cta button-reset">Enviar avaliação</button></form></section></div><aside class="pd-sidebar"><section class="pd-card pd-buy"><span class="pd-eyebrow">Compra na Tech Peças</span><div class="pd-price">'+price+'</div><p class="pd-note">'+(imported?'Estoque de demonstração, sujeito a confirmação.':'Entrega e frete a confirmar no checkout.')+'</p><p class="'+(available?'pd-stock':'pd-note')+'">'+(available?(imported?'Quantidade de demonstração':'Estoque disponível'):'Indisponível')+'</p><label>Quantidade<select id="pdQuantity" '+(available?'':'disabled')+'>'+Array.from({length:available?Math.min(100,Number(p.estoque)):1},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+' unidade(s)</option>').join('')+'</select></label><div class="pd-actions"><button id="pdBuy" class="primary-cta button-reset" '+(available?'':'disabled')+'>Comprar agora</button><button id="pdAdd" class="secondary-cta button-reset" '+(available?'':'disabled')+'>Adicionar ao carrinho</button></div><p class="pd-note">Confira a referência e a aplicação antes de finalizar.</p></section><section class="pd-card"><h2>Loja</h2><p><strong>Tech Peças IA</strong></p><p class="pd-note">Catálogo de autopeças e comparação de ofertas.</p></section><section class="pd-card"><h2>Meios de pagamento</h2><div class="pd-payment-methods"><span>Pix</span><span>Cartão</span></div><p class="pd-note">Disponibilidade e condições exibidas no checkout. Pagamento processado pelo provedor integrado.</p></section><section class="pd-card"><h2>Produtos relacionados</h2><div id="pdRelated" class="pd-related">Carregando...</div></section></aside></div>';
  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const field = id => document.getElementById(id);
  function checkVehicle(){
    const marca=norm(field('pdMarca').value), modelo=norm(field('pdModelo').value), ano=Number(field('pdAno').value);
    const match=compat.find(c=>norm(c.marca)===marca&&norm(c.modelo)===modelo&&ano>=Number(c.ano_inicio)&&ano<=Number(c.ano_fim));
    const verdict=field('pdVerdict');
    verdict.dataset.state=match?'yes':'unknown';
    verdict.textContent=match?'Aplicação cadastrada para este veículo. Confira também motor, versão, código original e observações antes da compra. '+(match.observacao||''):compat.length?'Veículo não encontrado nas aplicações cadastradas. Não é possível confirmar a compatibilidade.':'Compatibilidade não confirmada: não há aplicações cadastradas para esta peça.';
  }
  field('pdVehicleForm').onsubmit=ev=>{ev.preventDefault();checkVehicle();};
  const user=getCurrentUser();
  if(user) apiCall('/veiculos?usuarioId='+encodeURIComponent(user.id)).then(r=>{
    if(!r.ok||!Array.isArray(r.veiculos))return;
    const garage=field('pdGarage');
    r.veiculos.forEach((v,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=[v.marca,v.modelo,v.ano,v.versao].filter(Boolean).join(' ');garage.append(o);});
    garage.onchange=()=>{if(garage.value==='')return;const v=r.veiculos[Number(garage.value)];field('pdMarca').value=v.marca||'';field('pdModelo').value=v.modelo||'';field('pdAno').value=v.ano||'';checkVehicle();};
    if(r.veiculos.length===1){garage.value='0';garage.onchange();}
  });
  function renderDescription(ficha=[]){
    const box=field('pdGeneralSource');
    const type=norm(p.nome);
    const types=[
      [/motor de partida|arranque/,'Motor de partida','O motor de partida auxilia no acionamento inicial do motor do veículo. A aplicação depende da referência, da fixação e das características elétricas.'],
      [/filtro.*oleo/,'Filtro de óleo','O filtro de óleo retém impurezas do lubrificante que circula pelo motor. A referência, as dimensões e o tipo de conexão variam conforme a aplicação.'],
      [/filtro.*ar/,'Filtro de ar','O filtro de ar retém partículas do ar admitido pelo motor. Formato, dimensões e referência variam de acordo com o veículo.'],
      [/filtro.*combustivel/,'Filtro de combustível','O filtro de combustível ajuda a reter contaminantes do combustível. A aplicação depende do sistema de alimentação e da referência.'],
      [/filtro.*cabine/,'Filtro de cabine','O filtro de cabine ajuda a reter partículas do ar que entra no habitáculo. O formato e as dimensões dependem do sistema de ventilação.'],
      [/vela.*ignicao/,'Vela de ignição','A vela de ignição produz a centelha necessária à combustão em motores de ignição por centelha. Rosca, grau térmico e referência dependem da motorização.'],
      [/pastilha.*freio/,'Pastilha de freio','A pastilha de freio atua por atrito com o disco para auxiliar na desaceleração. A referência, o eixo e o sistema de freio precisam corresponder ao veículo.'],
      [/amortecedor/,'Amortecedor','O amortecedor controla as oscilações da suspensão. A aplicação varia conforme o eixo, a configuração da suspensão e a referência.'],
      [/bieleta/,'Bieleta','A bieleta conecta componentes da suspensão à barra estabilizadora, quando presente. Comprimento, fixação e referência variam conforme o veículo.'],
      [/alternador/,'Alternador','O alternador fornece energia ao sistema elétrico e auxilia na recarga da bateria enquanto o motor funciona. A aplicação depende da referência e das características elétricas.'],
      [/bateria/,'Bateria automotiva','A bateria armazena energia para os sistemas elétricos do veículo. Capacidade, tensão, dimensões e polaridade variam conforme a aplicação.']
    ];
    const item=types.find(([rx])=>rx.test(type));
    const raw=String(p.descricao||'').trim();
    const generic=/^Peça automotiva selecionada pela Tech Peças/i.test(raw);
    const general=ficha.find(v=>v.campo==='Informações gerais da peça'&&v.valor);
    const specs=ficha.filter(v=>v.valor&&!['Informações gerais da peça','Aplicações informadas na fonte','Motorização e versão'].includes(v.campo));
    box.innerHTML='<h3>Sobre o produto</h3><p>'+e(p.nome||'Autopeça')+'</p>'+
      (item?'<p>'+e(item[2])+'</p><p class="pd-note">Informação geral sobre este tipo de peça; não é uma especificação da unidade anunciada.</p>':'')+
      (!generic&&raw?'<p>'+e(raw)+'</p>':'')+
      (general?'<h3>Informações encontradas nas fontes</h3><p>'+e(general.valor)+' '+sourceLinks(general)+'</p>':'')+
      '<h3>Dados específicos do produto</h3>'+
      (specs.length?'<ul>'+specs.map(v=>'<li><strong>'+e(v.campo)+':</strong> '+e(v.valor)+' '+sourceLinks(v)+'</li>').join('')+'</ul>':'<p>As especificações desta unidade ainda não foram confirmadas pelas fontes consultadas.</p>')+
      '<p class="pd-note">Antes de comprar, confira o código da peça e as aplicações na seção de compatibilidade.</p>';
  }
  renderDescription();
  async function loadTechnical(){
    const box=field('pdTechnical');
    const r=await apiCall('/catalogo/'+id+'/ficha-tecnica');
    if(!r.ok){box.textContent='Especificações temporariamente indisponíveis.';return;}
    const ficha=r.ficha||[];
    technicalRows=ficha;
    renderDescription(ficha);
    const applications=ficha.filter(v=>['Aplicações informadas na fonte','Motorização e versão'].includes(v.campo)&&v.valor);
    field('pdSourceApplications').innerHTML=applications.length?applications.map(v=>'<p><strong>'+e(v.campo)+': </strong>'+e(v.valor)+( /^https?:\/\//i.test(v.fonte||'')?' · <a target="_blank" rel="noopener noreferrer" href="'+e(v.fonte)+'">Conferir fonte</a>':'')+'</p>').join('')+'<p class="pd-note">Aplicações extraídas de fontes; confirme o código original e a versão antes da compra.</p>':'<p>Não encontramos aplicações com evidência suficiente nas fontes.</p>';
    const mainFields=['Fabricante identificado','Referência do fabricante','Código OEM','Material','Garantia'];
    const basic=rows.map(([campo,valor])=>({campo,valor}));
    const primary=[...basic,...ficha.filter(v=>mainFields.includes(v.campo))];
    const other=ficha.filter(v=>!mainFields.includes(v.campo)&&!['Informações gerais da peça','Aplicações informadas na fonte','Motorização e versão'].includes(v.campo));
    box.innerHTML='<p class="pd-note">Informações armazenadas no catálogo. Dados ausentes não foram confirmados.</p><div class="pd-spec-grid"><div><h3>Características principais</h3>'+specTable(primary)+'</div><div><h3>Outras especificações</h3>'+specTable(other)+'</div></div>';
    const highlights=ficha.filter(v=>v.valor&&mainFields.includes(v.campo)).slice(0,4);
    field('pdHighlights').innerHTML=highlights.length?'<ul>'+highlights.map(v=>'<li>'+e(v.campo)+': '+e(v.valor)+'</li>').join('')+'</ul>':'<p class="pd-note">Especificações adicionais ainda não confirmadas.</p>';

  }
  loadTechnical();
  const media = document.getElementById('pdMedia');
  const placeholder = () => { media.textContent = 'Imagem indisponível'; };
  if (image) { const img = document.createElement('img'); img.alt = p.nome || 'Produto'; img.onerror = () => { if(fallback && !img.src.endsWith(fallback)) img.src=fallback; else placeholder(); }; img.src=image; media.append(img); } else placeholder();
  if(image){
    const thumb=document.createElement('img');thumb.src=image;thumb.className='pd-thumb';thumb.alt='Miniatura do produto';field('pdThumb').append(thumb);
    if(!storeSafeImage(p.imagem_url))field('pdImageNote').textContent='Imagem ilustrativa.';
    const zoom=()=>{const img=media.querySelector('img');if(!img)return;const dialog=document.createElement('dialog');dialog.className='pd-zoom';const close=document.createElement('button');close.className='secondary-cta button-reset';close.textContent='Fechar';close.onclick=()=>dialog.close();const photo=document.createElement('img');photo.src=img.src;photo.alt=img.alt;dialog.append(close,photo);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();};media.onclick=zoom;
  }
  field('pdAdd').onclick=()=>storeAddToCart(p,Number(field('pdQuantity').value));
  field('pdBuy').onclick=()=>storeAddToCart(p,Number(field('pdQuantity').value),true);
  field('pdQuestionForm').onsubmit=ev=>{
    ev.preventDefault();
    const q=norm(field('pdQuestion').value), synonyms=[[/oem|original|codigo/,'Código OEM'],[/referencia|numero da peca/,'Referência do fabricante'],[/serve|compativ|veiculo|carro|aplica/,'Aplicações informadas na fonte'],[/motor|versao/,'Motorização e versão'],[/marca|fabricante/,'Fabricante identificado'],[/tamanho|medida/,'Dimensões']];
    const matched=technicalRows.filter(v=>v.valor&&(q.includes(norm(v.campo))||synonyms.some(([rx,c])=>rx.test(q)&&v.campo===c)));
    field('pdQuestionAnswer').innerHTML=matched.length?matched.map(v=>'<p><strong>'+e(v.campo)+': </strong>'+e(v.valor)+' '+sourceLinks(v)+'</p>').join(''):'<p>Não há informação suficiente na ficha para responder com segurança. Consulte o fabricante antes da compra.</p>';
  };
  apiCall('/catalogo?categoria='+encodeURIComponent(p.categoria||'')).then(r=>{
    const list=(r.produtos||[]).filter(v=>Number(v.id)!==id&&v.categoria===p.categoria).slice(0,5);
    const el=field('pdRelated');el.textContent='';
    if(!list.length){el.textContent='Nenhum produto relacionado disponível.';return;}
    list.forEach(v=>{const link=document.createElement('a');link.href='produto.html?id='+Number(v.id);const url=storeSafeImage(v.imagem_url)||storeCatalogFallback(v);const img=document.createElement(url?'img':'span');if(url){img.src=url;img.alt=v.nome||'Autopeça';img.loading='lazy';}else{img.className='pd-related-placeholder';img.textContent='TP';}const label=document.createElement('span');label.textContent=v.nome||'Produto';const amount=document.createElement('strong');amount.textContent=v.preco_site===null?'Consultar':storeMoney(v.preco_site);label.append(amount);link.append(img,label);el.append(link);});
  }).catch(()=>{field('pdRelated').textContent='Produtos relacionados indisponíveis.';});
  async function reviews(){const r=await apiCall('/catalogo/'+id+'/avaliacoes');const el=document.getElementById('pdReviewList');if(!r.ok){el.textContent='Avaliações temporariamente indisponíveis.';return;}const list=r.avaliacoes||[];const avg=list.length?(list.reduce((a,b)=>a+Number(b.nota),0)/list.length).toFixed(1):null;field('pdRatingLink').textContent=avg?avg+' / 5 · '+list.length+' avaliações recentes':'Sem avaliações ainda';el.innerHTML=list.length?'<div class="pd-review-summary"><div><div class="pd-review-average">'+avg+'</div><small>'+list.length+' avaliações recentes</small></div><div>'+[5,4,3,2,1].map(n=>{const count=list.filter(v=>Number(v.nota)===n).length;return '<div class="pd-review-bar"><span>'+n+' ★</span><div class="pd-review-track"><span style="width:'+Math.round(count/list.length*100)+'%"></span></div><span>'+count+'</span></div>';}).join('')+'</div></div>'+list.map(v=>'<article class="pd-review-item"><p class="pd-stars">'+ '★'.repeat(Math.max(0,Math.min(5,Number(v.nota)||0)))+'</p><p>'+e(v.comentario)+'</p></article>').join(''):'<p>Este produto ainda não recebeu avaliações.</p>';}
  document.getElementById('pdReviewForm').onsubmit=async ev=>{ev.preventDefault();if(!getCurrentUser())return showWarning('Entre na sua conta para avaliar.');const b=ev.target.querySelector('button');b.disabled=true;try{const r=await apiCall('/catalogo/'+id+'/avaliacoes',{method:'POST',body:JSON.stringify({nota:Number(document.getElementById('pdRating').value),comentario:document.getElementById('pdComment').value.trim()})});if(!r.ok)return showWarning(r.msg||'Não foi possível avaliar.');ev.target.reset();await reviews();}finally{b.disabled=false;}};
  reviews();
});