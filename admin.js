const db = window.brenntagSupabase;
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
let adminUser = null;
let adminProfile = null;
let adminProducts = [];
let adminOrders = [];
let adminExpenses = [];
let currentTerms = null;
let activeProductImagePath = null;
let adminSupport = [];
let selectedSupportId = null;
let supportChannel = null;
let ordersChannel = null;

function showPageLoader(message = 'Processando...') {
  const loader = $('#pageLoader');
  if (!loader) return;
  const text = loader.querySelector('#pageLoaderText');
  if (text) text.textContent = message;
  loader.classList.remove('hidden');
  loader.setAttribute('aria-busy', 'true');
}
function hidePageLoader() {
  const loader = $('#pageLoader');
  if (!loader) return;
  loader.classList.add('hidden');
  loader.setAttribute('aria-busy', 'false');
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function brl(n) { return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function showAdminMessage(message, type = 'info') {
  const existing = $('#adminToast');
  existing?.remove();
  const toast = document.createElement('div');
  toast.id = 'adminToast';
  toast.className = `app-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 250); }, 2800);
}

async function requireAdmin() {
  if (!window.brenntagSupabaseConfigured || !db) {
    location.replace('login.html');
    return false;
  }
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) {
    location.replace('login.html?mode=login&redirect=admin');
    return false;
  }
  adminUser = sessionData.session.user;
  const { data: profile, error } = await db.from('profiles').select('id,full_name,role').eq('id', adminUser.id).maybeSingle();
  if (error || !profile || profile.role !== 'admin') {
    await db.auth.signOut();
    location.replace('index.html');
    return false;
  }
  adminProfile = profile;
  $('#headerUser').textContent = adminProfile.full_name || adminUser.email || 'Administrador';
  return true;
}

async function loadAdminData() {
  const [productResult, orderResult, expenseResult, termsResult, supportResult] = await Promise.all([
    db.from('products').select('*').order('id', { ascending: true }),
    db.from('orders').select('*, order_items(*), customer:profiles!orders_customer_id_fkey(id,full_name)').order('created_at', { ascending: false }),
    db.from('expenses').select('*').order('created_at', { ascending: false }),
    db.from('purchase_terms').select('*').eq('active', true).order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('support_attendances').select('*').order('last_message_at', { ascending: false })
  ]);
  if (productResult.error) throw productResult.error;
  if (orderResult.error) throw orderResult.error;
  if (expenseResult.error) throw expenseResult.error;
  if (termsResult.error) throw termsResult.error;
  if (supportResult.error) throw supportResult.error;
  adminProducts = productResult.data || [];
  adminOrders = orderResult.data || [];
  adminExpenses = expenseResult.data || [];
  currentTerms = termsResult.data || null;
  adminSupport = supportResult.data || [];
}

function dataSummary() {
  const income = adminOrders.filter(x => x.status !== 'Cancelado').reduce((a, x) => a + Number(x.total || 0), 0);
  const out = adminExpenses.reduce((a, x) => a + Number(x.value || 0), 0);
  return {
    units: adminProducts.filter(x => x.active !== false).reduce((a, x) => a + Number(x.stock || 0), 0),
    income,
    out,
    activeProducts: adminProducts.filter(x => x.active !== false).length,
    lowStock: adminProducts.filter(x => x.active !== false && Number(x.stock || 0) <= 5).length
  };
}

function renderDashboard() {
  const d = dataSummary();
  $('#statOrders').textContent = adminOrders.length;
  const week = Date.now() - 604800000;
  $('#statOrdersSub').textContent = adminOrders.filter(x => new Date(x.created_at).getTime() >= week).length + ' esta semana';
  $('#statStock').textContent = d.units + ' unidades';
  $('#statStockSub').textContent = d.activeProducts + ' produtos cadastrados';
  $('#statStockAlert').textContent = d.lowStock + ' produtos com estoque baixo';
  $('#statIncome').textContent = brl(d.income);
  $('#statExpense').textContent = brl(d.out);
  $('#financeIncome').textContent = brl(d.income);
  $('#financeExpense').textContent = brl(d.out);
  $('#financeBalance').textContent = brl(d.income - d.out);
  $('#ordersCountLabel').textContent = adminOrders.length + ' pedidos';
  $('#stockCountLabel').textContent = d.units + ' unidades';
  renderChart(); renderDonut(); renderMoves();
}

function renderChart() {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 864e5);
    const key = date.toLocaleDateString('pt-BR');
    return {
      label: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      in: adminOrders.filter(x => x.status !== 'Cancelado' && new Date(x.created_at).toLocaleDateString('pt-BR') === key).reduce((a,x)=>a+Number(x.total||0),0),
      out: adminExpenses.filter(x => new Date(x.created_at).toLocaleDateString('pt-BR') === key).reduce((a,x)=>a+Number(x.value||0),0)
    };
  });
  const max = Math.max(1, ...days.map(x => Math.max(x.in, x.out)));
  $('#financeChart').innerHTML = days.map(x => `
    <div class="bar-col"><div class="bar-pair"><div class="bar in" style="height:${x.in/max*100}%"></div><div class="bar out" style="height:${x.out/max*100}%"></div></div><span>${x.label}</span></div>
  `).join('');
}

function renderDonut() {
  const totals = {};
  adminProducts.filter(x => x.active !== false).forEach(x => { totals[x.category] = (totals[x.category] || 0) + Number(x.stock || 0); });
  const entries = Object.entries(totals).filter(([, value]) => value > 0);
  const colors = ['#111820','#8fa8b8','#c8862a','#6f9b5b','#b65b4b'];
  let start = 0;
  const total = dataSummary().units || 1;
  const stops = entries.map(([label, value], index) => { const begin = start; start += value / total * 100; return `${colors[index % colors.length]} ${begin}% ${start}%`; });
  $('#stockDonut').style.background = `conic-gradient(${stops.join(',') || '#d9dfe3 0 100%'})`;
  $('#donutTotalUnits').textContent = dataSummary().units;
  $('#stockLegend').innerHTML = entries.map(([label, value], index) => `<li><span class="name"><i style="background:${colors[index%colors.length]}"></i>${escapeHtml(label)}</span><b>${Math.round(value/total*100)}%</b></li>`).join('') || '<li>Nenhum produto cadastrado</li>';
}

function renderOrders() {
  const q = ($('#orderSearch').value || '').toLowerCase();
  const filter = $('#orderStatusFilter').value;
  const list = adminOrders.filter(order => {
    if (filter && order.status !== filter) return false;
    const haystack = `${order.id} ${order.customer?.full_name || ''} ${(order.order_items || []).map(i => i.product_name).join(' ')}`.toLowerCase();
    return !q || haystack.includes(q);
  });
  $('#ordersBody').innerHTML = list.map(order => `
    <tr>
      <td>#${String(order.id).padStart(6,'0')}</td>
      <td>${new Date(order.created_at).toLocaleString('pt-BR')}<br><small>${escapeHtml(order.customer?.full_name || 'Cliente')}</small></td>
      <td>${(order.order_items || []).reduce((s,i)=>s+Number(i.quantity||0),0)}</td>
      <td>
        <select class="status-select" data-order="${order.id}">
          ${['Recebido','Em separação','Enviado','Concluído','Cancelado'].map(status => `<option ${status===order.status?'selected':''}>${status}</option>`).join('')}
        </select>
      </td>
      <td class="val in">${brl(order.total)}</td>
      <td><button class="icon-btn delete-order" data-id="${order.id}">Excluir</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">Nenhum pedido encontrado.</td></tr>';
}

function renderStock() {
  const q = ($('#stockSearch').value || '').toLowerCase();
  const list = adminProducts.filter(p => p.name.toLowerCase().includes(q));
  $('#stockBody').innerHTML = list.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category)}</td>
      <td><input class="qty-input" data-id="${p.id}" type="number" min="0" value="${p.stock}"></td>
      <td>${brl(p.price)}</td>
      <td><span class="tag ${p.stock <= 5 ? 'out' : 'in'}">${p.stock <= 0 ? 'Esgotado' : p.stock <= 5 ? 'Baixo' : 'Normal'}</span></td>
      <td><button class="icon-btn save-stock" data-id="${p.id}">Salvar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">Nenhum produto.</td></tr>';
}

function renderProducts() {
  const list = adminProducts;
  $('#productCards').innerHTML = list.map(p => `
    <article class="product-admin-card ${p.active === false ? 'inactive' : ''}">
      <div class="product-admin-image">${p.image_url ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}">` : `<span>${p.icon || '▥'}</span>`}</div>
      <div class="product-admin-info"><span class="product-cat">${escapeHtml(p.category)}</span><h4>${escapeHtml(p.name)}</h4><p>${p.stock} unidades · ${brl(p.price)} ${p.active===false?'· Inativo':''}</p></div>
      <div><button class="icon-btn edit-product" data-id="${p.id}">Editar</button>${p.active === false ? `<button class="icon-btn activate-product" data-id="${p.id}">Ativar</button>` : `<button class="icon-btn danger delete-product" data-id="${p.id}">Desativar</button>`}</div>
    </article>
  `).join('') || '<p>Nenhum produto cadastrado.</p>';
}

function renderFinance() {
  const rows = [
    ...adminOrders.filter(x => x.status !== 'Cancelado').map(x => ({ date:x.created_at, type:'in', desc:'Pedido #' + String(x.id).padStart(6,'0'), value:x.total })),
    ...adminExpenses.map(x => ({ date:x.created_at, type:'out', desc:x.description, value:x.value, id:x.id }))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('#financeBody').innerHTML = rows.map(x => `<tr><td>${new Date(x.date).toLocaleDateString('pt-BR')}</td><td><span class="tag ${x.type}">${x.type==='in'?'Entrada':'Saída'}</span></td><td>${escapeHtml(x.desc)}</td><td class="val ${x.type}">${brl(x.value)}</td><td>${x.type==='out'?`<button class="icon-btn delete-expense" data-id="${x.id}">Excluir</button>`:'—'}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma movimentação.</td></tr>';
}

function renderMoves() {
  const rows = [
    ...adminOrders.filter(x=>x.status!=='Cancelado').map(x=>({date:x.created_at,type:'in',desc:'Pedido #'+String(x.id).padStart(6,'0'),value:x.total})),
    ...adminExpenses.map(x=>({date:x.created_at,type:'out',desc:x.description,value:x.value}))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  $('#movesBody').innerHTML = rows.map(x => `<tr><td>${new Date(x.date).toLocaleDateString('pt-BR')}</td><td><span class="tag ${x.type}">${x.type==='in'?'Entrada':'Saída'}</span></td><td>${escapeHtml(x.desc)}</td><td class="val ${x.type}">${x.type==='in'?'+':'−'} ${brl(x.value)}</td></tr>`).join('') || '<tr><td colspan="4">Nenhuma movimentação registrada.</td></tr>';
}

function openModal(content) { $('#modalContent').innerHTML = content; $('#adminModal').classList.remove('hidden'); }
function closeModal() { $('#adminModal').classList.add('hidden'); activeProductImagePath = null; }
$$('[data-close]').forEach(button => button.onclick = closeModal);

async function imageToCompressedBlob(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
  const bitmap = await createImageBitmap(file);
  const max = 1400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a imagem.')), 'image/webp', 0.84));
}

function productForm(id) {
  const p = adminProducts.find(x => Number(x.id) === Number(id)) || { name:'', category:'', price:'', stock:0, icon:'⚙', image_url:'', description:'' };
  openModal(`
    <h2>${id ? 'Editar' : 'Cadastrar'} produto</h2>
    <form id="productForm" class="form-grid">
      <label>Nome<input name="name" required value="${escapeHtml(p.name)}"></label>
      <label>Categoria<input name="category" required value="${escapeHtml(p.category)}"></label>
      <label>Preço<input name="price" type="text" inputmode="decimal" required value="${p.price !== '' ? escapeHtml(p.price) : ''}" placeholder="Ex.: 189,90"></label>
      <label>Estoque<input name="stock" type="number" min="0" required value="${p.stock || 0}"></label>
      <label>Ícone<input name="icon" value="${escapeHtml(p.icon || '⚙')}"></label>
      <label class="full">Imagem do produto<input name="imageFile" id="imageFile" type="file" accept="image/*"><small>JPG, PNG ou WEBP. A imagem será otimizada antes do envio.</small></label>
      <div class="full image-preview-container"><img id="imagePreview" class="image-preview ${p.image_url ? '' : 'hidden'}" src="${p.image_url || ''}" alt="Pré-visualização"></div>
      <label class="full">Descrição<textarea name="description">${escapeHtml(p.description || '')}</textarea></label>
      <button class="primary-btn full" type="submit">Salvar produto</button>
    </form>
  `);

  let imageUrl = p.image_url || '';
  const fileInput = $('#imageFile');
  const preview = $('#imagePreview');
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const blob = await imageToCompressedBlob(file);
      preview.src = URL.createObjectURL(blob);
      preview.classList.remove('hidden');
      preview.dataset.pending = 'true';
      preview._pendingBlob = blob;
    } catch (error) { showAdminMessage(error.message, 'error'); }
  };

  $('#productForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const values = Object.fromEntries(form.entries());
    const price = Number(String(values.price).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) return showAdminMessage('Preço inválido.', 'error');

    showPageLoader(id ? 'Atualizando produto...' : 'Cadastrando produto...');
    try {
      if (preview._pendingBlob) {
        const path = `products/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await db.storage.from('product-images').upload(path, preview._pendingBlob, { contentType: 'image/webp', upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicData } = db.storage.from('product-images').getPublicUrl(path);
        imageUrl = publicData.publicUrl;
      }

      const payload = {
        name: values.name.trim(),
        category: values.category.trim(),
        price,
        stock: Number(values.stock || 0),
        icon: values.icon || '⚙',
        image_url: imageUrl,
        description: values.description || '',
        active: true
      };

      let error;
      if (id) {
        ({ error } = await db.from('products').update(payload).eq('id', id));
      } else {
        ({ error } = await db.from('products').insert(payload));
      }
      if (error) throw error;
      closeModal();
      await refreshAdmin();
    initOrdersRealtime();
    initSupportRealtime();
      showAdminMessage(id ? 'Produto atualizado.' : 'Produto cadastrado.', 'success');
    } catch (error) {
      console.error(error);
      showAdminMessage(error.message || 'Não foi possível salvar o produto.', 'error');
    } finally { hidePageLoader(); }
  };
}

function expenseForm() {
  openModal(`<h2>Registrar despesa</h2><form id="expenseForm" class="form-grid"><label class="full">Descrição<input name="description" required placeholder="Ex.: transporte, embalagem..."></label><label>Valor<input name="value" type="text" inputmode="decimal" placeholder="Ex.: 120,00" required></label><button class="primary-btn full" type="submit">Registrar saída</button></form>`);
  $('#expenseForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const value = Number(String(form.get('value')).replace(/\./g,'').replace(',','.'));
    if (!Number.isFinite(value) || value <= 0) return showAdminMessage('Valor inválido.', 'error');
    showPageLoader('Registrando despesa...');
    try {
      const { error } = await db.from('expenses').insert({ description:String(form.get('description')).trim(), value, created_by:adminUser.id });
      if (error) throw error;
      closeModal(); await refreshAdmin(); showAdminMessage('Despesa registrada.', 'success');
    } catch (error) { showAdminMessage(error.message || 'Não foi possível registrar a despesa.', 'error'); }
    finally { hidePageLoader(); }
  };
}

function termsForm() {
  const terms = currentTerms || { title:'Termos de compra, reembolso e cancelamento', content:'', version:0 };
  openModal(`
    <h2>Editar termos de compra</h2>
    <p class="section-note">Salvar cria uma nova versão e arquiva a anterior.</p>
    <form id="termsForm" class="form-grid terms-admin-form">
      <label class="full">Título<input name="title" required value="${escapeHtml(terms.title)}"></label>
      <label class="full">Texto dos termos<textarea name="content" required>${escapeHtml(terms.content)}</textarea></label>
      <button class="primary-btn full" type="submit">Publicar nova versão</button>
    </form>
  `);
  $('#termsForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    showPageLoader('Salvando termos...');
    try {
      const { data: version, error } = await db.rpc('save_purchase_terms', {
        p_title: String(form.get('title')).trim(),
        p_content: String(form.get('content')).trim()
      });
      if (error) throw error;
      closeModal(); await refreshAdmin(); showAdminMessage(`Termos publicados na versão ${version}.`, 'success');
    } catch (error) { showAdminMessage(error.message || 'Não foi possível salvar os termos.', 'error'); }
    finally { hidePageLoader(); }
  };
}

function termsSection() {
  $('#termsVersion').textContent = currentTerms ? `Versão ${currentTerms.version}` : 'Nenhuma versão';
  $('#termsTitle').textContent = currentTerms?.title || 'Termos não cadastrados';
  $('#termsPreview').textContent = currentTerms?.content || 'Cadastre os termos de compra, reembolso e cancelamento.';
}

async function transitionOrderStatus(orderId, status) {
  showPageLoader('Atualizando pedido...');
  try {
    const { error } = await db.rpc('admin_update_order_status', { p_order_id:Number(orderId), p_new_status:status });
    if (error) throw error;
    await refreshAdmin();
    showAdminMessage('Status do pedido atualizado.', 'success');
  } catch (error) {
    console.error(error);
    renderOrders();
    showAdminMessage(error.message || 'Não foi possível atualizar o status.', 'error');
  } finally { hidePageLoader(); }
}

async function deleteOrder(orderId) {
  if (!window.confirm('Excluir este pedido? O histórico será removido e, se necessário, o estoque será devolvido.')) return;
  showPageLoader('Excluindo pedido...');
  try {
    const { error } = await db.rpc('admin_delete_order', { p_order_id:Number(orderId) });
    if (error) throw error;
    await refreshAdmin();
    showAdminMessage('Pedido excluído.', 'success');
  } catch (error) { showAdminMessage(error.message || 'Não foi possível excluir o pedido.', 'error'); }
  finally { hidePageLoader(); }
}

async function setProductActive(id, active) {
  showPageLoader(active ? 'Ativando produto...' : 'Desativando produto...');
  try {
    const { error } = await db.from('products').update({ active }).eq('id', id);
    if (error) throw error;
    await refreshAdmin();
    showAdminMessage(active ? 'Produto ativado.' : 'Produto desativado.', 'success');
  } catch (error) { showAdminMessage(error.message || 'Não foi possível alterar o produto.', 'error'); }
  finally { hidePageLoader(); }
}

async function saveStock(id) {
  const input = document.querySelector(`.qty-input[data-id="${id}"]`);
  const stock = Number(input?.value);
  if (!Number.isInteger(stock) || stock < 0) return showAdminMessage('Quantidade inválida.', 'error');
  showPageLoader('Atualizando estoque...');
  try {
    const { error } = await db.from('products').update({ stock }).eq('id', id);
    if (error) throw error;
    await refreshAdmin();
    showAdminMessage('Estoque atualizado.', 'success');
  } catch (error) { showAdminMessage(error.message || 'Não foi possível atualizar o estoque.', 'error'); }
  finally { hidePageLoader(); }
}

async function deleteExpense(id) {
  if (!window.confirm('Excluir esta despesa?')) return;
  showPageLoader('Excluindo despesa...');
  try {
    const { error } = await db.from('expenses').delete().eq('id', id);
    if (error) throw error;
    await refreshAdmin(); showAdminMessage('Despesa excluída.', 'success');
  } catch (error) { showAdminMessage(error.message || 'Não foi possível excluir a despesa.', 'error'); }
  finally { hidePageLoader(); }
}


async function deleteSupportAttendance(){
  if(!selectedSupportId) return;
  const attendance=adminSupport.find(x=>x.id===selectedSupportId);
  if(!attendance || attendance.status!=='Encerrado') return;
  const confirmed=window.confirm('Excluir este atendimento encerrado? Todas as mensagens deste atendimento também serão removidas.');
  if(!confirmed) return;
  try{
    const {error}=await db.rpc('admin_delete_support_attendance',{p_attendance_id:attendance.id});
    if(error) throw error;
    selectedSupportId=null;
    closeSupportModal();
    showAdminMessage('Atendimento excluído.','success');
  }catch(err){
    showAdminMessage(err.message||'Não foi possível excluir o atendimento.','error');
  }
}

function formatDateTime(value){return new Date(value).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function renderSupport(){
  const q=($('#supportSearch')?.value||'').toLowerCase().trim();
  const st=$('#supportStatusFilter')?.value||'';
  const list=adminSupport.filter(a=>(!st||a.status===st)&&(!q||[a.protocol,a.full_name,a.email,a.document].join(' ').toLowerCase().includes(q)));
  $('#supportCountLabel').textContent=adminSupport.length+' atendimento'+(adminSupport.length===1?'':'s');
  $('#supportAdminList').innerHTML=list.length?list.map(a=>`<button class="support-admin-item ${selectedSupportId===a.id?'active':''}" data-support-open="${a.id}"><div><strong>${escapeHtml(a.full_name)}</strong><span>${escapeHtml(a.protocol)}</span></div><div><small>${escapeHtml(a.status)}</small><time>${formatDateTime(a.last_message_at)}</time></div></button>`).join(''):`<div class="support-empty small"><strong>Nenhum atendimento encontrado</strong><span>Novos atendimentos aparecerão aqui.</span></div>`;
  renderSupportChat();
}
async function loadSupportMessages(id){const {data,error}=await db.from('support_messages').select('*').eq('attendance_id',id).order('created_at',{ascending:true});if(error)throw error;return data||[];}
function openSupportModal(){
  const modal=$('#supportAdminModal');
  if(!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('support-admin-modal-open');
}
function closeSupportModal(){
  const modal=$('#supportAdminModal');
  if(!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('support-admin-modal-open');
}
async function finalizeSupportAttendance(){
  if(!selectedSupportId) return;
  const attendance=adminSupport.find(x=>x.id===selectedSupportId);
  if(!attendance || attendance.status==='Encerrado') return;
  const confirmed=window.confirm('Deseja Finalizar esse atendimento?');
  if(!confirmed) return;
  try{
    const {error}=await db.rpc('admin_update_support_status',{p_attendance_id:attendance.id,p_status:'Encerrado'});
    if(error) throw error;
    attendance.status='Encerrado';
    renderSupportListOnly();
    closeSupportModal();
    showAdminMessage('Atendimento finalizado.','success');
  }catch(err){
    showAdminMessage(err.message||'Não foi possível fechar o atendimento.','error');
  }
}
function supportMessageHtml(m){
  return `<div class="support-admin-msg ${escapeHtml(m.sender)}" data-message-id="${String(m.id)}"><div>${escapeHtml(m.message)}</div><span>${m.sender==='admin'?'Você':m.sender==='client'?'Cliente':'Assistente'} · ${formatDateTime(m.created_at)}</span></div>`;
}
async function renderSupportChat(){
  const chat=$('#supportAdminChat');
  if(!chat) return;
  const a=adminSupport.find(x=>x.id===selectedSupportId);
  if(!a){
    chat.innerHTML='<div class="support-empty"><strong>Selecione um atendimento</strong><span>As mensagens do cliente aparecerão aqui.</span></div>';
    return;
  }
  try{
    const msgs=await loadSupportMessages(a.id);
    const closed=a.status==='Encerrado';
    chat.innerHTML=`<div class="support-admin-head">
      <div><span>PROTOCOLO ${escapeHtml(a.protocol)}</span><h3 id="supportAdminModalTitle">${escapeHtml(a.full_name)}</h3><p>${escapeHtml(a.client_type)} · ${escapeHtml(a.email)} · ${escapeHtml(a.document)}</p></div>
      <div class="support-admin-head-actions">
        <select id="supportAdminStatus" data-support-status="${a.id}"><option ${a.status==='Aguardando admin'?'selected':''}>Aguardando admin</option><option ${a.status==='Em atendimento'?'selected':''}>Em atendimento</option><option ${a.status==='Aguardando cliente'?'selected':''}>Aguardando cliente</option><option ${a.status==='Encerrado'?'selected':''}>Encerrado</option></select>
        ${closed ? '<button class="support-admin-delete" id="supportAdminDelete" type="button">Excluir Atendimento</button>' : '<button class="support-admin-finish" id="supportAdminFinish" type="button">Finalizar Atendimento</button>'}
        <button class="support-admin-close" id="supportAdminClose" type="button" title="Fechar aba" aria-label="Fechar aba">×</button>
      </div>
    </div>
    <div class="support-admin-messages">${msgs.map(supportMessageHtml).join('')}</div>
    ${closed
      ? '<div class="support-admin-composer is-closed"><div class="support-admin-closed-note">Este atendimento está encerrado.</div></div>'
      : '<form class="support-admin-composer" id="supportAdminForm"><textarea id="supportAdminInput" placeholder="Digite a resposta para o cliente…" rows="1"></textarea><button class="primary-btn" type="submit">Enviar resposta</button></form>'}`;

    const box=chat.querySelector('.support-admin-messages');
    box.scrollTop=box.scrollHeight;

    chat.querySelector('#supportAdminClose').onclick=closeSupportModal;
    chat.querySelector('#supportAdminFinish')?.addEventListener('click',finalizeSupportAttendance);
    chat.querySelector('#supportAdminDelete')?.addEventListener('click',deleteSupportAttendance);

    if(!closed){
      chat.querySelector('#supportAdminForm').onsubmit=async e=>{
        e.preventDefault();
        const input=chat.querySelector('#supportAdminInput');
        const text=input.value.trim();
        if(!text)return;
        input.disabled=true;
        try{
          const {error}=await db.rpc('admin_reply_support',{p_attendance_id:a.id,p_message:text});
          if(error)throw error;
          input.value='';
          // O INSERT do Realtime cuida da renderização; não recarregar o histórico.
        }catch(err){
          showAdminMessage(err.message||'Não foi possível enviar a resposta.','error');
        }finally{input.disabled=false;input.focus();}
      };
    }

    chat.querySelector('#supportAdminStatus').onchange=async e=>{
      const nextStatus=e.target.value;
      try{
        const {error}=await db.rpc('admin_update_support_status',{p_attendance_id:a.id,p_status:nextStatus});
        if(error)throw error;
        a.status=nextStatus;
        if(nextStatus==='Encerrado'){
          await renderSupportChat();
        }else if(closed){
          await renderSupportChat();
        }
        renderSupportListOnly();
      }catch(err){
        e.target.value=a.status;
        showAdminMessage(err.message||'Não foi possível atualizar o atendimento.','error');
      }
    };
  }catch(e){
    chat.innerHTML='<div class="support-empty"><strong>Não foi possível carregar as mensagens</strong><span>Confira as permissões e o SQL do atendimento.</span></div>';
    console.error(e);
  }
}
async function selectSupport(id){
  selectedSupportId=id;
  renderSupportListOnly();
  openSupportModal();
  await renderSupportChat();
}

async function refreshAdmin() {
  await loadAdminData();
  renderDashboard(); renderOrders(); renderStock(); renderProducts(); renderFinance(); termsSection(); renderSupport();
  $('#lastUpdate').textContent = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function go(id) {
  $$('.admin-section').forEach(section => section.classList.remove('current'));
  const section = $('#' + id + 'Section');
  if (!section) return;
  section.classList.add('current');
  $$('.nav-group a').forEach(link => link.classList.toggle('active', link.dataset.section === id));
  history.replaceState(null, '', '#' + id);
  section.scrollIntoView({ behavior:'smooth', block:'start' });
}

$$('[data-section]').forEach(link => link.addEventListener('click', event => {
  const id = link.dataset.section;
  if (!id) return;
  event.preventDefault();
  go(id);
}));

$('#logoutButton').onclick = async event => {
  event.preventDefault();
  await db.auth.signOut();
  location.href = 'login.html';
};

$('#openProduct').onclick = () => productForm();
$('#openProductFromStock').onclick = () => productForm();
$('#openExpense').onclick = () => expenseForm();
$('#openTerms').onclick = () => termsForm();
$('#orderSearch').oninput = renderOrders;
$('#orderStatusFilter').onchange = renderOrders;
$('#stockSearch').oninput = renderStock;
$('#supportSearch').oninput = renderSupport;
$('#supportStatusFilter').onchange = renderSupport;

$('#supportAdminModal')?.addEventListener('click', event => { if(event.target.matches('[data-support-modal-close]')) closeSupportModal(); });
document.addEventListener('keydown', event => { if(event.key === 'Escape' && !$('#supportAdminModal')?.classList.contains('hidden')) closeSupportModal(); });

document.addEventListener('click', async event => {
  const target = event.target;
  const id = target.dataset.id;
  if (target.dataset.supportOpen) return selectSupport(target.dataset.supportOpen);
  if (target.classList.contains('edit-product')) return productForm(Number(id));
  if (target.classList.contains('delete-product')) return setProductActive(Number(id), false);
  if (target.classList.contains('activate-product')) return setProductActive(Number(id), true);
  if (target.classList.contains('save-stock')) return saveStock(Number(id));
  if (target.classList.contains('delete-order')) return deleteOrder(Number(id));
  if (target.classList.contains('delete-expense')) return deleteExpense(Number(id));
});

document.addEventListener('change', event => {
  if (event.target.classList.contains('status-select')) transitionOrderStatus(event.target.dataset.order, event.target.value);
});

async function refreshSelectedSupportMessagesOnly(){
  if(!selectedSupportId) return;
  const box=document.querySelector('#supportAdminChat .support-admin-messages');
  if(!box) return;
  try{
    const msgs=await loadSupportMessages(selectedSupportId);
    const wasNearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;
    const existingIds=new Set([...box.querySelectorAll('[data-message-id]')].map(el=>String(el.dataset.messageId)));
    msgs.forEach(m=>{
      const id=String(m.id);
      if(existingIds.has(id)) return;
      box.insertAdjacentHTML('beforeend',supportMessageHtml(m));
    });
    if(wasNearBottom) box.scrollTop=box.scrollHeight;
  }catch(e){console.error('Erro ao atualizar mensagens:',e);}
}
function renderSupportListOnly(){
  const q=($('#supportSearch')?.value||'').toLowerCase().trim();
  const st=$('#supportStatusFilter')?.value||'';
  const list=adminSupport.filter(a=>(!st||a.status===st)&&(!q||[a.protocol,a.full_name,a.email,a.document].join(' ').toLowerCase().includes(q)));
  $('#supportCountLabel').textContent=adminSupport.length+' atendimento'+(adminSupport.length===1?'':'s');
  $('#supportAdminList').innerHTML=list.length?list.map(a=>`<button class="support-admin-item ${selectedSupportId===a.id?'active':''}" data-support-open="${a.id}"><div><strong>${escapeHtml(a.full_name)}</strong><span>${escapeHtml(a.protocol)}</span></div><div><small>${escapeHtml(a.status)}</small><time>${formatDateTime(a.last_message_at)}</time></div></button>`).join(''):`<div class="support-empty small"><strong>Nenhum atendimento encontrado</strong><span>Novos atendimentos aparecerão aqui.</span></div>`;
}
function initOrdersRealtime(){
  if(ordersChannel) db.removeChannel(ordersChannel);
  ordersChannel=db.channel('admin-orders-live')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},async payload=>{
      try{
        const id=payload.new?.id;
        if(!id) return;
        const {data,error}=await db.from('orders').select('*, order_items(*), customer:profiles!orders_customer_id_fkey(id,full_name)').eq('id',id).single();
        if(error) throw error;
        if(!adminOrders.some(o=>String(o.id)===String(id))) adminOrders.unshift(data);
        else adminOrders=adminOrders.map(o=>String(o.id)===String(id)?data:o);
        renderDashboard(); renderOrders();
        showAdminMessage(`Novo pedido #${String(id).padStart(6,'0')} recebido.`, 'success');
      }catch(e){console.error('Erro ao receber novo pedido:',e);}
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders'},async payload=>{
      try{
        const id=payload.new?.id;
        if(!id) return;
        const {data,error}=await db.from('orders').select('*, order_items(*), customer:profiles!orders_customer_id_fkey(id,full_name)').eq('id',id).single();
        if(error) throw error;
        const index=adminOrders.findIndex(o=>String(o.id)===String(id));
        if(index>=0) adminOrders[index]=data; else adminOrders.unshift(data);
        renderDashboard(); renderOrders();
      }catch(e){console.error('Erro ao atualizar pedido em tempo real:',e);}
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'orders'},payload=>{
      const id=payload.old?.id;
      if(!id) return;
      adminOrders=adminOrders.filter(o=>String(o.id)!==String(id));
      renderDashboard(); renderOrders();
    })
    .subscribe(status=>{
      if(status==='CHANNEL_ERROR' || status==='TIMED_OUT') console.error('Canal Realtime de pedidos do admin:',status);
    });
}

function initSupportRealtime(){
  if(supportChannel) db.removeChannel(supportChannel);

  supportChannel=db.channel('admin-support-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'support_attendances'},payload=>{
      try{
        const attendance=payload.new||payload.old;
        if(!attendance?.id) return;

        const index=adminSupport.findIndex(a=>a.id===attendance.id);
        if(payload.eventType==='DELETE'){
          if(index>=0) adminSupport.splice(index,1);
          if(selectedSupportId===attendance.id){
            selectedSupportId=null;
            renderSupportListOnly();
            renderSupportChat();
          }else{
            renderSupportListOnly();
          }
          return;
        }

        if(index>=0) adminSupport[index]={...adminSupport[index],...payload.new};
        else adminSupport.push(payload.new);

        adminSupport.sort((a,b)=>new Date(b.last_message_at||0)-new Date(a.last_message_at||0));
        renderSupportListOnly();

        if(selectedSupportId===attendance.id){
          const status=$('#supportAdminStatus');
          if(status && payload.new.status) status.value=payload.new.status;
        }
      }catch(e){console.error('Erro no Realtime do atendimento:',e);}
    })
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},payload=>{
      try{
        const message=payload.new;
        if(!message?.id || !message?.attendance_id) return;

        const attendance=adminSupport.find(a=>a.id===message.attendance_id);
        if(attendance){
          attendance.last_message_at=message.created_at||attendance.last_message_at;
        }

        renderSupportListOnly();

        if(selectedSupportId!==message.attendance_id) return;

        const box=document.querySelector('#supportAdminChat .support-admin-messages');
        if(!box) return;

        const messageId=String(message.id);
        if(box.querySelector(`[data-message-id="${messageId}"]`)) return;

        const el=document.createElement('div');
        el.className=`support-admin-msg ${message.sender}`;
        el.dataset.messageId=messageId;
        el.innerHTML=`<div>${escapeHtml(message.message)}</div><span>${message.sender==='admin'?'Você':message.sender==='client'?'Cliente':'Assistente'} · ${formatDateTime(message.created_at)}</span>`;

        const wasNearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100;
        box.appendChild(el);
        if(wasNearBottom) box.scrollTop=box.scrollHeight;
      }catch(e){console.error('Erro no Realtime da mensagem:',e);}
    })
    .subscribe(status=>{
      if(status==='CHANNEL_ERROR' || status==='TIMED_OUT') console.error('Canal Realtime do admin:',status);
    });
}

async function init() {
  if (!(await requireAdmin())) return;
  $('#greeting').textContent = `Olá, ${adminProfile.full_name || 'Administrador'}.`;
  $('#todayDate').textContent = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  showPageLoader('Carregando painel...');
  try {
    await refreshAdmin();
    initOrdersRealtime();
    initSupportRealtime();
    const hash = location.hash.slice(1);
    if (hash) go(hash);
  } catch (error) {
    console.error(error);
    showAdminMessage(error.message || 'Não foi possível carregar o painel.', 'error');
  } finally {
    await wait(500); hidePageLoader();
  }
}

init();
