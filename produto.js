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
  root.innerHTML = '<article class="pd-card pd-grid"><div class="pd-media" id="pdMedia"></div><div><small>'+e(p.categoria || 'Autopeça')+'</small><h1>'+e(p.nome)+'</h1><p>'+e(p.fabricante || 'Fabricante não informado')+'</p><a href="#pdReviews">Avaliações do produto</a><div class="pd-price">'+(p.preco_site === null ? 'Consultar' : storeMoney(p.preco_site))+'</div><p>'+ (available ? Number(p.estoque)+' unidades em estoque' : 'Indisponível para compra')+'</p><div class="pd-actions"><button id="pdAdd" class="primary-cta button-reset" '+(available?'':'disabled')+'>Adicionar ao carrinho</button><a class="secondary-cta" href="carrinho.html">Ver carrinho</a></div><p class="pd-note">Frete e condições de pagamento na finalização da compra.</p></div></article>'+
  '<section class="pd-card"><h2>Características do produto</h2><table class="pd-spec">'+rows.map(([k,v])=>'<tr><th>'+e(k)+'</th><td>'+e(v || 'Não informado')+'</td></tr>').join('')+'</table></section>'+
  '<section class="pd-card"><h2>Descrição</h2><p>'+e(p.descricao || 'Descrição não cadastrada.')+'</p></section>'+
  '<section class="pd-card"><h2>Compatibilidade com veículos</h2>'+(compat.length?'<table class="pd-spec">'+compat.map(c=>'<tr><th>'+e(c.marca)+' '+e(c.modelo)+'</th><td>'+e(c.ano_inicio)+'–'+e(c.ano_fim)+' '+e(c.observacao || '')+'</td></tr>').join('')+'</table>':'<p>Compatibilidade ainda não cadastrada. Confirme com o fabricante antes de comprar.</p>')+'</section>'+
  '<section class="pd-card" id="pdReviews"><h2>Avaliações dos clientes</h2><div id="pdReviewList">Carregando avaliações...</div><form id="pdReviewForm"><label>Nota <select id="pdRating" required><option value="">Selecione</option>'+[5,4,3,2,1].map(n=>'<option value="'+n+'">'+n+' de 5 estrelas</option>').join('')+'</select></label><p><label>Comentário <textarea id="pdComment" maxlength="1000" rows="4" style="width:100%" required></textarea></label></p><button class="primary-cta button-reset">Enviar avaliação</button></form></section>';
  const media = document.getElementById('pdMedia');
  const placeholder = () => { media.textContent = 'Imagem indisponível'; };
  if (image) { const img = document.createElement('img'); img.alt = p.nome || 'Produto'; img.onerror = () => { if(fallback && !img.src.endsWith(fallback)) img.src=fallback; else placeholder(); }; img.src=image; media.append(img); } else placeholder();
  document.getElementById('pdAdd').onclick = () => storeAddToCart(p);
  async function reviews(){const r=await apiCall('/catalogo/'+id+'/avaliacoes');const el=document.getElementById('pdReviewList');if(!r.ok){el.textContent='Avaliações temporariamente indisponíveis.';return;}const list=r.avaliacoes||[];el.innerHTML=list.length?'<p><strong>'+ (list.reduce((a,b)=>a+Number(b.nota),0)/list.length).toFixed(1)+' / 5</strong> · '+list.length+' avaliações recentes</p>'+list.map(v=>'<article><p class="pd-stars">'+ '★'.repeat(Math.max(0,Math.min(5,Number(v.nota)||0)))+'</p><p>'+e(v.comentario)+'</p></article>').join(''):'<p>Este produto ainda não recebeu avaliações.</p>';}
  document.getElementById('pdReviewForm').onsubmit=async ev=>{ev.preventDefault();if(!getCurrentUser())return showWarning('Entre na sua conta para avaliar.');const b=ev.target.querySelector('button');b.disabled=true;try{const r=await apiCall('/catalogo/'+id+'/avaliacoes',{method:'POST',body:JSON.stringify({nota:Number(document.getElementById('pdRating').value),comentario:document.getElementById('pdComment').value.trim()})});if(!r.ok)return showWarning(r.msg||'Não foi possível avaliar.');ev.target.reset();await reviews();}finally{b.disabled=false;}};
  reviews();
});