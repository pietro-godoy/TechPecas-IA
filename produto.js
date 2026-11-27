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
  const rows = [['Nome',p.nome],['Fabricante',p.fabricante],['Categoria',p.categoria],['Código SKU',p.sku]];
  const compat = Array.isArray(data.compatibilidades) ? data.compatibilidades : [];
  document.title = (p.nome || 'Produto') + ' | Tech Peças';
  root.innerHTML = '<article class="pd-card pd-grid"><div class="pd-media" id="pdMedia"></div><div><small>'+e(p.categoria || 'Autopeça')+'</small><h1>'+e(p.nome)+'</h1><p>'+e(p.fabricante || 'Fabricante não informado')+'</p><a href="#pdReviews">Avaliações do produto</a> · <a href="#pdCompatibility">Conferir meu veículo</a><div class="pd-price">'+(p.preco_site === null ? 'Consultar' : storeMoney(p.preco_site))+'</div><p>'+ (available ? Number(p.estoque)+' unidades em estoque' : 'Indisponível para compra')+'</p><div class="pd-actions"><button id="pdAdd" class="primary-cta button-reset" '+(available?'':'disabled')+'>Adicionar ao carrinho</button><a class="secondary-cta" href="carrinho.html">Ver carrinho</a></div><p class="pd-note">Frete e condições de pagamento na finalização da compra.</p></div></article>'+
  '<section class="pd-card"><h2>Ficha técnica</h2><table class="pd-spec">'+rows.map(([k,v])=>'<tr><th>'+e(k)+'</th><td>'+e(v || 'Não informado')+'</td></tr>').join('')+'</table><div id="pdTechnical">Carregando especificações...</div></section>'+
  '<section class="pd-card"><h2>Descrição</h2><p>'+e(p.descricao || 'Descrição não cadastrada.')+'</p></section>'+
  '<section class="pd-card" id="pdCompatibility"><span class="section-label dark-label">CONFIRA ANTES DE COMPRAR</span><h2>Esta peça serve no meu veículo?</h2><p>Selecione um veículo da garagem ou informe os dados manualmente.</p><label>Minha garagem<select id="pdGarage"><option value="">Informar manualmente</option></select></label><form id="pdVehicleForm"><div class="pd-vehicle-grid"><label>Marca<input id="pdMarca" required placeholder="Ex.: Volkswagen"></label><label>Modelo<input id="pdModelo" required placeholder="Ex.: Gol"></label><label>Ano<input id="pdAno" type="number" min="1950" max="2100" required placeholder="2015"></label></div><button class="primary-cta button-reset">Verificar compatibilidade</button></form><div id="pdVerdict" class="pd-verdict" role="status">Informe seu veículo para consultar as aplicações cadastradas.</div><h3>Aplicações cadastradas</h3>'+(compat.length?'<table class="pd-spec">'+compat.map(c=>'<tr><th>'+e(c.marca)+' '+e(c.modelo)+'</th><td>'+e(c.ano_inicio)+'–'+e(c.ano_fim)+' '+e(c.observacao || '')+'</td></tr>').join('')+'</table>':'<p>Compatibilidade ainda não cadastrada. Confirme com o fabricante antes de comprar.</p>')+'</section>'+
  '<section class="pd-card" id="pdReviews"><h2>Avaliações dos clientes</h2><div id="pdReviewList">Carregando avaliações...</div><form id="pdReviewForm"><label>Nota <select id="pdRating" required><option value="">Selecione</option>'+[5,4,3,2,1].map(n=>'<option value="'+n+'">'+n+' de 5 estrelas</option>').join('')+'</select></label><p><label>Comentário <textarea id="pdComment" maxlength="1000" rows="4" style="width:100%" required></textarea></label></p><button class="primary-cta button-reset">Enviar avaliação</button></form></section>';
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
  async function loadTechnical(){
    const box=field('pdTechnical');
    const r=await apiCall('/catalogo/'+id+'/ficha-tecnica');
    if(!r.ok){box.textContent='Especificações temporariamente indisponíveis.';return;}
    const ficha=r.ficha||[];
    box.innerHTML='<p class="pd-note">Especificações cadastradas com referência de origem. Campos pendentes não confirmam aplicação.</p><table class="pd-spec">'+ficha.map(v=>'<tr><th>'+e(v.campo)+'</th><td>'+e(v.valor||'Não verificado')+(v.valor&&/^https?:\/\//i.test(v.fonte||'')?' · <a target="_blank" rel="noopener noreferrer" href="'+e(v.fonte)+'">Fonte</a>':'')+'</td></tr>').join('')+'</table>';
    if(getCurrentUser()?.papel!=='admin')return;
    const form=document.createElement('form');
    form.innerHTML='<h3>Editar ficha técnica</h3><p>Preencha somente dados confirmados para esta referência.</p>'+ficha.map((v,i)=>'<label>'+e(v.campo)+'<input data-value="'+i+'" maxlength="500" value="'+e(v.valor||'')+'" placeholder="Valor confirmado"><input type="url" data-source="'+i+'" maxlength="700" value="'+e(v.fonte||'')+'" placeholder="URL da fonte"></label>').join('')+'<button class="primary-cta button-reset">Salvar ficha técnica</button>';
    box.append(form);
    form.onsubmit=async ev=>{ev.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const result=await apiCall('/catalogo/'+id+'/ficha-tecnica',{method:'PUT',body:JSON.stringify({ficha:ficha.map((v,i)=>({campo:v.campo,valor:form.querySelector('[data-value="'+i+'"]').value,fonte:form.querySelector('[data-source="'+i+'"]').value}))})});if(!result.ok)return showWarning(result.msg||'Erro ao salvar');await loadTechnical();}finally{button.disabled=false;}};
  }
  loadTechnical();
  const media = document.getElementById('pdMedia');
  const placeholder = () => { media.textContent = 'Imagem indisponível'; };
  if (image) { const img = document.createElement('img'); img.alt = p.nome || 'Produto'; img.onerror = () => { if(fallback && !img.src.endsWith(fallback)) img.src=fallback; else placeholder(); }; img.src=image; media.append(img); } else placeholder();
  document.getElementById('pdAdd').onclick = () => storeAddToCart(p);
  async function reviews(){const r=await apiCall('/catalogo/'+id+'/avaliacoes');const el=document.getElementById('pdReviewList');if(!r.ok){el.textContent='Avaliações temporariamente indisponíveis.';return;}const list=r.avaliacoes||[];el.innerHTML=list.length?'<p><strong>'+ (list.reduce((a,b)=>a+Number(b.nota),0)/list.length).toFixed(1)+' / 5</strong> · '+list.length+' avaliações recentes</p>'+list.map(v=>'<article class="pd-review-item"><p class="pd-stars">'+ '★'.repeat(Math.max(0,Math.min(5,Number(v.nota)||0)))+'</p><p>'+e(v.comentario)+'</p></article>').join(''):'<p>Este produto ainda não recebeu avaliações.</p>';}
  document.getElementById('pdReviewForm').onsubmit=async ev=>{ev.preventDefault();if(!getCurrentUser())return showWarning('Entre na sua conta para avaliar.');const b=ev.target.querySelector('button');b.disabled=true;try{const r=await apiCall('/catalogo/'+id+'/avaliacoes',{method:'POST',body:JSON.stringify({nota:Number(document.getElementById('pdRating').value),comentario:document.getElementById('pdComment').value.trim()})});if(!r.ok)return showWarning(r.msg||'Não foi possível avaliar.');ev.target.reset();await reviews();}finally{b.disabled=false;}};
  reviews();
});