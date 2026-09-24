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
let adminCoupons = [];
let adminReviews = [];
let paymentMethods = [];
let progressiveTiers = [];
let selectedSupportId = null;
let supportChannel = null;
let ordersChannel = null;
const FINANCE_OWNER_ID = '915bef33-abe4-4ce9-95e1-3745389bd9a4';
const FINANCE_ADMIN_ID = '94c5c943-f19d-4804-bde9-3411dd550060';
let financeInitialBalance = 0;

let adminShippingMethods = [];
let adminShippingSettings = { free_shipping_enabled: false, free_shipping_minimum: 0 };

async function loadShippingAdmin() {
  const [{ data: methods, error: methodsError }, { data: settings, error: settingsError }] = await Promise.all([
    db.from('shipping_methods').select('*').order('sort_order', { ascending: true }),
    db.from('shipping_settings').select('*').eq('id', 1).maybeSingle()
  ]);

  if (methodsError) throw methodsError;
  if (settingsError) throw settingsError;

  adminShippingMethods = methods || [];
  adminShippingSettings = settings || adminShippingSettings;
  renderShippingAdmin();
}

function renderShippingAdmin() {
  const host = $('#shippingAdminSection');
  if (!host) return;

  host.innerHTML = `
    <div class="panel-head">
      <div>
        <h3>Fretes</h3>
        <p class="section-note">Defina as modalidades que aparecem no checkout, os preços e quando o frete grátis é liberado.</p>
      </div>
      <button type="button" class="secondary-btn" id="addShippingMethod">+ Adicionar modalidade</button>
    </div>

    <div class="shipping-settings-grid">
      <label>Frete grátis
        <select id="freeShippingEnabled">
          <option value="false" ${!adminShippingSettings.free_shipping_enabled ? 'selected' : ''}>Desativado</option>
          <option value="true" ${adminShippingSettings.free_shipping_enabled ? 'selected' : ''}>Ativado</option>
        </select>
      </label>
      <label>Frete grátis a partir de
        <input id="freeShippingMinimum" type="text" inputmode="decimal"
          value="${Number(adminShippingSettings.free_shipping_minimum || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">
      </label>
    </div>

    <div class="shipping-admin-list">
      ${adminShippingMethods.map(method => `
        <div class="shipping-admin-row" data-id="${method.id}">
          <div>
            <label>Nome
              <input class="shipping-name" value="${escapeHtml(method.name)}">
            </label>
          </div>
          <div>
            <label>Preço
              <input class="shipping-price" type="text" inputmode="decimal"
                value="${Number(method.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">
            </label>
          </div>
          <div>
            <label>Status
              <select class="shipping-active">
                <option value="true" ${method.active ? 'selected' : ''}>Ativo</option>
                <option value="false" ${!method.active ? 'selected' : ''}>Desativado</option>
              </select>
            </label>
          </div>
          <div class="shipping-admin-actions">
            <button type="button" class="primary-btn save-shipping" data-id="${method.id}">Salvar</button>
            <button type="button" class="icon-btn danger delete-shipping" data-id="${method.id}">Remover</button>
          </div>
        </div>
      `).join('') || '<p class="section-note">Nenhuma modalidade cadastrada.</p>'}
    </div>

    <button type="button" class="primary-btn" id="saveShippingSettings">Salvar configuração de frete grátis</button>
  `;

  host.querySelectorAll('.save-shipping').forEach(button => {
    button.addEventListener('click', () => saveShippingMethod(Number(button.dataset.id)));
  });

  host.querySelectorAll('.delete-shipping').forEach(button => {
    button.addEventListener('click', () => deleteShippingMethod(Number(button.dataset.id)));
  });

  host.querySelector('#addShippingMethod')?.addEventListener('click', addShippingMethod);
  host.querySelector('#saveShippingSettings')?.addEventListener('click', saveShippingSettings);
}

function parseAdminMoney(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return NaN;
  return Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
}

async function saveShippingMethod(id) {
  const row = document.querySelector(`.shipping-admin-row[data-id="${id}"]`);
  if (!row) return;

  const name = row.querySelector('.shipping-name')?.value.trim();
  const price = parseAdminMoney(row.querySelector('.shipping-price')?.value);
  const active = row.querySelector('.shipping-active')?.value === 'true';

  if (!name || !Number.isFinite(price) || price < 0) {
    showAdminMessage('Informe um nome e um preço de frete válidos.', 'error');
    return;
  }

  showPageLoader('Salvando modalidade de frete...');
  try {
    const { error } = await db.rpc('admin_update_shipping_method', {
      p_id: id,
      p_name: name,
      p_price: price,
      p_active: active
    });
    if (error) throw error;
    await loadShippingAdmin();
    showAdminMessage('Modalidade de frete atualizada.', 'success');
  } catch (error) {
    showAdminMessage(error.message || 'Não foi possível salvar o frete.', 'error');
  } finally {
    hidePageLoader();
  }
}

async function addShippingMethod() {
  openModal(`
    <h2>Adicionar modalidade de frete</h2>
    <form id="shippingMethodForm" class="form-grid">
      <label class="full">Nome
        <input name="name" required placeholder="Ex.: Agendado">
      </label>
      <label class="full">Preço
        <input name="price" type="text" inputmode="decimal" required placeholder="Ex.: 55,00">
      </label>
      <label class="full">Status
        <select name="active">
          <option value="true">Ativo</option>
          <option value="false">Desativado</option>
        </select>
      </label>
      <button type="submit" class="primary-btn full">Adicionar modalidade</button>
    </form>
  `);

  $('#shippingMethodForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const price = parseAdminMoney(form.get('price'));
    const active = String(form.get('active')) === 'true';

    if (!name || !Number.isFinite(price) || price < 0) {
      showAdminMessage('Informe dados válidos para a modalidade.', 'error');
      return;
    }

    showPageLoader('Adicionando modalidade...');
    try {
      const { error } = await db.rpc('admin_create_shipping_method', {
        p_name: name,
        p_price: price,
        p_active: active
      });
      if (error) throw error;
      closeModal();
      await loadShippingAdmin();
      showAdminMessage('Modalidade adicionada.', 'success');
    } catch (error) {
      showAdminMessage(error.message || 'Não foi possível adicionar a modalidade.', 'error');
    } finally {
      hidePageLoader();
    }
  };
}

async function deleteShippingMethod(id) {
  const method = adminShippingMethods.find(item => Number(item.id) === Number(id));
  if (!method) return;
  if (!window.confirm(`Remover a modalidade "${method.name}"? Pedidos antigos continuarão registrados.`)) return;

  showPageLoader('Removendo modalidade...');
  try {
    const { error } = await db.rpc('admin_delete_shipping_method', { p_id: id });
    if (error) throw error;
    await loadShippingAdmin();
    showAdminMessage('Modalidade removida.', 'success');
  } catch (error) {
    showAdminMessage(error.message || 'Não foi possível remover a modalidade.', 'error');
  } finally {
    hidePageLoader();
  }
}

async function saveShippingSettings() {
  const enabled = $('#freeShippingEnabled')?.value === 'true';
  const minimum = parseAdminMoney($('#freeShippingMinimum')?.value);

  if (!Number.isFinite(minimum) || minimum < 0) {
    showAdminMessage('Valor mínimo inválido.', 'error');
    return;
  }

  showPageLoader('Salvando configuração de frete grátis...');
  try {
    const { error } = await db.rpc('admin_update_shipping_settings', {
      p_enabled: enabled,
      p_minimum: minimum
    });
    if (error) throw error;
    await loadShippingAdmin();
    showAdminMessage('Configuração de frete grátis salva.', 'success');
  } catch (error) {
    showAdminMessage(error.message || 'Não foi possível salvar a configuração.', 'error');
  } finally {
    hidePageLoader();
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  const balanceButton = $('#editInitialBalance');
  if (balanceButton) balanceButton.classList.toggle('hidden', ![FINANCE_OWNER_ID, FINANCE_ADMIN_ID].includes(adminUser.id));
  return true;
}

async function loadAdminData() {
  const [productResult, orderResult, expenseResult, termsResult, supportResult, couponResult, financeResult, reviewResult, paymentMethodsResult] = await Promise.all([
    db.from('products').select('*').order('id', { ascending: true }),
    db.from('orders').select('*, order_items(*), customer:profiles!orders_customer_id_fkey(id,full_name)').order('created_at', { ascending: false }),
    db.from('expenses').select('*').order('created_at', { ascending: false }),
    db.from('purchase_terms').select('*').eq('active', true).order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('support_attendances').select('*').order('last_message_at', { ascending: false }),
    db.from('discount_coupons').select('*').order('created_at', { ascending: false }),
    db.rpc('finance_get_initial_balance'),
    db.from('order_reviews').select('*, customer:profiles!order_reviews_customer_id_fkey(id,full_name)').order('created_at', { ascending: false }),
    db.from('payment_methods').select('*').order('sort_order', { ascending: true })
  ]);
  if (productResult.error) throw productResult.error;
  if (orderResult.error) throw orderResult.error;
  if (expenseResult.error) throw expenseResult.error;
  if (termsResult.error) throw termsResult.error;
  if (supportResult.error) throw supportResult.error;
  if (couponResult.error) throw couponResult.error;
  if (financeResult.error) throw financeResult.error;
  if (reviewResult.error) throw reviewResult.error;
  if (paymentMethodsResult.error) throw paymentMethodsResult.error;
  adminProducts = productResult.data || [];
  adminOrders = orderResult.data || [];
  adminExpenses = expenseResult.data || [];
  currentTerms = termsResult.data || null;
  adminSupport = supportResult.data || [];
  adminCoupons = couponResult.data || [];
  adminReviews = reviewResult.data || [];
  paymentMethods = paymentMethodsResult.data || [];
  financeInitialBalance = Number(financeResult.data || 0);
}

function dataSummary() {
  const income = adminOrders.filter(x => x.status !== 'Cancelado').reduce((a, x) => a + Number(x.total || 0), 0);
  const out = adminExpenses.reduce((a, x) => a + Number(x.value || 0), 0);
  return {
    units: adminProducts.filter(x => x.active !== false).reduce((a, x) => a + Number(x.stock || 0), 0),
    income,
    out,
    initialBalance: financeInitialBalance,
    balance: financeInitialBalance + income - out,
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
  $('#financeBalance').textContent = brl(d.balance);
  const balanceButton = $('#editInitialBalance');
  if (balanceButton) balanceButton.classList.toggle('hidden', ![FINANCE_OWNER_ID, FINANCE_ADMIN_ID].includes(adminUser?.id));
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

function invoiceStatusLabel(order) {
  const status = order.nf_status || 'Pendente';
  const cls = status === 'Enviada' ? 'sent' : status === 'Aprovada' ? 'approved' : '';
  return `<span class="nf-status-mini ${cls}">${escapeHtml(status)}</span>`;
}


function formatOrderAddress(order) {
  const line1 = [order.shipping_street, order.shipping_number].filter(Boolean).join(', ');
  const line2 = [order.shipping_neighborhood, order.shipping_city, order.shipping_state].filter(Boolean).join(' · ');
  const line3 = order.shipping_cep ? `CEP ${order.shipping_cep}` : '';
  return [line1, line2, line3, order.shipping_complement ? `Complemento: ${order.shipping_complement}` : '']
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br>');
}

function openOrderDetails(orderId) {
  const order = adminOrders.find(item => String(item.id) === String(orderId));
  if (!order) return;

  const items = order.order_items || [];
  const subtotal = Number(order.subtotal ?? items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const discount = Number(order.discount_amount || 0) + Number(order.progressive_discount_amount || 0);
  const shipping = Number(order.shipping_amount || 0);

  openModal(`
    <div class="order-detail-modal">
      <div class="order-detail-head">
        <div>
          <p class="eyebrow">PEDIDO #${String(order.id).padStart(6, '0')}</p>
          <h2>Detalhes do pedido</h2>
        </div>
        <span class="tag ${order.status === 'Cancelado' ? 'out' : 'in'}">${escapeHtml(order.status || 'Recebido')}</span>
      </div>

      <div class="order-detail-grid">
        <section>
          <h3>Cliente</h3>
          <p><strong>${escapeHtml(order.customer?.full_name || 'Cliente')}</strong><br>${escapeHtml(order.customer_email || 'E-mail não informado')}</p>
        </section>
        <section>
          <h3>Endereço de entrega</h3>
          <p>${formatOrderAddress(order) || 'Endereço não informado.'}</p>
        </section>
        <section>
          <h3>Pagamento</h3>
          <p>${escapeHtml(order.payment_method_name || order.payment_method || 'Não informado')}</p>
        </section>
        <section>
          <h3>Frete</h3>
          <p><strong>${escapeHtml(order.shipping_method_name || 'Não informado')}</strong><br>${shipping > 0 ? brl(shipping) : 'Grátis'}</p>
        </section>
      </div>

      <section class="order-detail-section">
        <h3>Observação do pedido</h3>
        <div class="order-detail-note">${escapeHtml(order.order_note || 'Nenhuma observação informada.')}</div>
      </section>

      <section class="order-detail-section">
        <h3>Produtos</h3>
        <div class="order-detail-items">
          ${items.map(item => `
            <div class="order-detail-item">
              <div><strong>${escapeHtml(item.product_name || 'Produto')}</strong><small>${Number(item.quantity || 0)} × ${brl(item.unit_price)}</small></div>
              <strong>${brl(item.subtotal)}</strong>
            </div>
          `).join('') || '<p>Nenhum item registrado.</p>'}
        </div>
      </section>

      <section class="order-detail-section order-detail-totals">
        <div><span>Subtotal</span><strong>${brl(subtotal)}</strong></div>
        ${Number(order.progressive_discount_amount || 0) > 0 ? `<div><span>Desconto progressivo</span><strong>- ${brl(order.progressive_discount_amount)}</strong></div>` : ''}
        ${Number(order.discount_amount || 0) > 0 ? `<div><span>Cupom ${escapeHtml(order.coupon_code || '')}</span><strong>- ${brl(order.discount_amount)}</strong></div>` : ''}
        <div><span>Frete</span><strong>${shipping > 0 ? brl(shipping) : 'Grátis'}</strong></div>
        <div class="grand"><span>Total</span><strong>${brl(order.total)}</strong></div>
      </section>

      <section class="order-detail-section">
        <h3>Nota Fiscal</h3>
        <p><strong>Status:</strong> ${invoiceStatusLabel(order)}${order.nf_file_name ? `<br><small>${escapeHtml(order.nf_file_name)}</small>` : ''}</p>
        <div class="order-detail-actions">
          <button type="button" class="secondary-btn" id="orderDetailInvoice">Abrir NF</button>
          <button type="button" class="primary-btn" id="orderDetailClose">Fechar</button>
        </div>
      </section>
    </div>
  `);

  $('#orderDetailInvoice')?.addEventListener('click', () => {
    closeModal();
    openInvoiceReview(order.id);
  });
  $('#orderDetailClose')?.addEventListener('click', closeModal);
}

function renderOrders() {
  const q = ($('#orderSearch').value || '').toLowerCase();
  const filter = $('#orderStatusFilter').value;
  const list = adminOrders.filter(order => {
    if (filter && order.status !== filter) return false;
    const haystack = `${order.id} ${order.customer?.full_name || ''} ${order.customer_email || ''} ${(order.order_items || []).map(i => i.product_name).join(' ')}`.toLowerCase();
    return !q || haystack.includes(q);
  });
  $('#ordersBody').innerHTML = list.map(order => `
    <tr>
      <td>#${String(order.id).padStart(6,'0')}</td>
      <td><button type="button" class="order-detail-trigger" data-order-detail="${order.id}">${new Date(order.created_at).toLocaleString('pt-BR')}<br><small>${escapeHtml(order.customer?.full_name || 'Cliente')}</small></button></td>
      <td>${(order.order_items || []).reduce((s,i)=>s+Number(i.quantity||0),0)}</td>
      <td>
        <select class="status-select" data-order="${order.id}">
          ${['Recebido','Em separação','Enviado','Concluído','Cancelado'].map(status => `<option ${status===order.status?'selected':''}>${status}</option>`).join('')}
        </select>
      </td>
      <td class="val in">${brl(order.total)}</td>
      <td><button class="icon-btn delete-order" data-id="${order.id}">Excluir</button></td>
      <td><div class="nf-action-stack">${invoiceStatusLabel(order)}<button class="icon-btn invoice-view" data-invoice-view="${order.id}">Visualizar</button>${order.nf_status === 'Aprovada' || order.nf_status === 'Enviada' ? `<button class="icon-btn invoice-send" data-invoice-send="${order.id}">Enviar</button>` : ''}</div></td>
    </tr>
  `).join('') || '<tr><td colspan="7">Nenhum pedido encontrado.</td></tr>';
}

function closeInvoiceModal() {
  $('#invoiceAdminModal')?.classList.add('hidden');
}

function invoiceDraftPdf(order) {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca de PDF não carregada.');
  const doc = new window.jspdf.jsPDF();
  const orderNumber = String(order.id).padStart(6, '0');
  const customerName = order.customer?.full_name || 'Cliente';
  let y = 18;
  doc.setFontSize(18); doc.setFont(undefined,'bold'); doc.text('BRENNTAG',14,y);
  doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.text('INDUSTRIAL MARKETPLACE',14,y+6);
  doc.setFontSize(15); doc.setFont(undefined,'bold'); doc.text('DOCUMENTO DE VENDA / NF',14,y+20);
  doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.text('RASCUNHO — PENDENTE DE REVISÃO ADMINISTRATIVA',14,y+27); y+=42;
  doc.setDrawColor(160); doc.rect(14,y-5,182,28); doc.setFont(undefined,'bold'); doc.text(`Pedido #${orderNumber}`,18,y+3);
  doc.setFont(undefined,'normal'); doc.text(`Emissão: ${new Date(order.created_at).toLocaleString('pt-BR')}`,18,y+10); doc.text(`Pagamento: Pix — Simulado`,18,y+17);
  doc.text(`Cliente: ${customerName}`,105,y+10); doc.text(`E-mail: ${order.customer_email || 'não informado'}`,105,y+17); y+=36;
  doc.setFont(undefined,'bold'); doc.text('DESTINATÁRIO',14,y); doc.setFont(undefined,'normal'); doc.text(`Nome: ${customerName}`,14,y+7); doc.text(`E-mail: ${order.customer_email || 'não informado'}`,14,y+14); doc.text(`Pagamento: ${order.payment_method_name || order.payment_method || 'não informado'}`,14,y+21); y+=32;doc.setFont(undefined,'bold'); doc.text('ENDEREÇO DE ENTREGA',14,y); doc.setFont(undefined,'normal'); doc.text(`${order.shipping_street || ''}, ${order.shipping_number || ''} - ${order.shipping_neighborhood || ''}`,14,y+7); doc.text(`${order.shipping_city || ''} - ${order.shipping_state || ''} | CEP ${order.shipping_cep || ''}`,14,y+14); if(order.shipping_complement) doc.text(`Complemento: ${order.shipping_complement}`,14,y+21); y += order.shipping_complement ? 32 : 25;
  doc.setFont(undefined,'bold'); doc.text('ITENS DA VENDA',14,y); y+=7; doc.line(14,y,196,y); y+=7;
  doc.text('Produto',14,y); doc.text('Qtd.',130,y); doc.text('Valor',165,y); y+=6; doc.setFont(undefined,'normal');
  (order.order_items||[]).forEach(item=>{doc.text(String(item.product_name||'').slice(0,58),14,y);doc.text(String(item.quantity||0),132,y);doc.text(`R$ ${brl(item.subtotal).replace('R$ ','')}`,165,y);y+=7;if(y>260){doc.addPage();y=20;}});
  doc.line(14,y+2,196,y+2);y+=12;const subtotal=Number(order.subtotal??(order.order_items||[]).reduce((s,i)=>s+Number(i.subtotal||0),0));doc.text('Subtotal',125,y);doc.text(`R$ ${brl(subtotal).replace('R$ ','')}`,165,y);y+=7;
  if(order.coupon_code){doc.text(`Cupom ${order.coupon_code} (${Number(order.discount_percent||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}%)`,90,y);doc.text(`- R$ ${brl(order.discount_amount).replace('R$ ','')}`,165,y);y+=7;}
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.text(`Frete: ${String(order.shipping_method_name||'Não informado').slice(0,42)}`,90,y);doc.text(Number(order.shipping_amount||0)>0?`R$ ${brl(order.shipping_amount).replace('R$ ','')}`:'Grátis',165,y);y+=7;
  doc.setFontSize(13);doc.setFont(undefined,'bold');doc.text(`TOTAL: R$ ${brl(order.total).replace('R$ ','')}`,125,y);y+=15;doc.setFontSize(9);doc.setFont(undefined,'normal');doc.text('Documento gerado automaticamente e sujeito à revisão administrativa.',14,y);doc.text('Sem valor fiscal até a conferência e validação da equipe responsável.',14,y+6);
  return doc.output('blob');
}

async function uploadAdminInvoiceFile(order, file, filename) {
  if (!file) throw new Error('Selecione um PDF.');
  if (file.type !== 'application/pdf') throw new Error('A NF precisa estar em formato PDF.');
  if (file.size > 10 * 1024 * 1024) throw new Error('O PDF deve ter no máximo 10 MB.');
  const path = `${order.customer_id}/${order.id}/${filename || `NF-${String(order.id).padStart(6,'0')}.pdf`}`;
  const { error: uploadError } = await db.storage.from('invoices').upload(path, file, { contentType:'application/pdf', upsert:true });
  if (uploadError) throw uploadError;
  const { error: updateError } = await db.from('orders').update({ nf_storage_path:path, nf_file_name:filename || `NF-${String(order.id).padStart(6,'0')}.pdf`, nf_status:'Pendente', nf_reviewed_at:null, nf_sent_at:null, updated_at:new Date().toISOString() }).eq('id',order.id);
  if (updateError) throw updateError;
  return path;
}

async function generateAdminInvoice(order) {
  const blob = invoiceDraftPdf(order);
  const file = new File([blob], `NF-${String(order.id).padStart(6,'0')}.pdf`, {type:'application/pdf'});
  return uploadAdminInvoiceFile(order, file, file.name);
}

async function getInvoiceUrl(path) {
  if (!path) return null;
  const { data, error } = await db.storage.from('invoices').createSignedUrl(path, 600);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function openInvoiceReview(orderId) {
  let order = adminOrders.find(o=>String(o.id)===String(orderId));
  if (!order) return;
  $('#invoiceAdminTitle').textContent = `NF do pedido #${String(order.id).padStart(6,'0')}`;
  $('#invoiceAdminMeta').textContent = `${order.customer?.full_name || 'Cliente'} · ${order.customer_email || 'E-mail não informado'}`;
  $('#invoiceAdminModal').classList.remove('hidden');
  const body = $('#invoiceAdminBody');
  body.innerHTML = '<div class="invoice-admin-empty"><strong>Carregando documento...</strong><span>Um instante.</span></div>';
  try {
    if (!order.nf_storage_path) {
      body.innerHTML = `<div class="invoice-admin-empty"><strong>Nenhuma NF foi anexada ainda.</strong><span>O sistema pode gerar um documento preliminar ou você pode anexar o PDF correto.</span><div class="invoice-admin-actions"><button class="primary-btn" id="generateInvoiceAdmin">Gerar documento preliminar</button><label class="secondary-btn">Adicionar PDF<input id="invoiceFileInput" class="invoice-admin-file" type="file" accept="application/pdf"></label></div><p class="invoice-admin-note">O documento preliminar é apenas para revisão e não possui valor fiscal.</p></div>`;
      $('#generateInvoiceAdmin').onclick=async()=>{showPageLoader('Gerando NF...');try{await generateAdminInvoice(order);await refreshAdmin();closeInvoiceModal();await openInvoiceReview(order.id);showAdminMessage('Documento preliminar gerado. Revise antes de aprovar.','success');}catch(e){showAdminMessage(e.message||'Não foi possível gerar o documento.','error');}finally{hidePageLoader();}};
      $('#invoiceFileInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;showPageLoader('Anexando PDF...');try{await uploadAdminInvoiceFile(order,file,file.name);await refreshAdmin();closeInvoiceModal();await openInvoiceReview(order.id);showAdminMessage('PDF anexado. Revise antes de aprovar.','success');}catch(err){showAdminMessage(err.message||'Não foi possível anexar o PDF.','error');}finally{hidePageLoader();}};
      return;
    }
    const url=await getInvoiceUrl(order.nf_storage_path);
    body.innerHTML=`<div class="invoice-admin-toolbar"><span class="invoice-admin-status ${order.nf_status==='Aprovada'?'approved':order.nf_status==='Enviada'?'sent':''}">${escapeHtml(order.nf_status||'Pendente')}</span><div class="invoice-admin-actions"><a class="secondary-btn" href="${url}" target="_blank" rel="noopener">Baixar / abrir PDF</a><label class="secondary-btn">Substituir PDF<input id="invoiceFileInput" class="invoice-admin-file" type="file" accept="application/pdf"></label></div></div><div class="invoice-admin-recipient"><strong>Destinatário</strong>${escapeHtml(order.customer?.full_name||'Cliente')} · ${escapeHtml(order.customer_email||'E-mail não informado')}</div><iframe class="invoice-admin-preview" src="${url}#toolbar=1&navpanes=0"></iframe><p class="invoice-admin-note">Confira os dados, valores e descontos. Se estiver tudo certo, clique em OK para aprovar a NF.</p><div class="invoice-admin-actions"><button class="secondary-btn" id="invoiceApproveBtn">OK — Aprovar NF</button>${order.nf_status==='Aprovada'||order.nf_status==='Enviada'?`<button class="primary-btn" id="invoiceSendBtn">Enviar NF por e-mail</button>`:''}</div>`;
    $('#invoiceFileInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;showPageLoader('Substituindo PDF...');try{await uploadAdminInvoiceFile(order,file,file.name);await refreshAdmin();closeInvoiceModal();await openInvoiceReview(order.id);showAdminMessage('PDF substituído. A NF voltou para revisão.','success');}catch(err){showAdminMessage(err.message||'Não foi possível substituir o PDF.','error');}finally{hidePageLoader();}};
    $('#invoiceApproveBtn').onclick=async()=>{showPageLoader('Aprovando NF...');try{const {error}=await db.rpc('admin_review_invoice',{p_order_id:order.id,p_status:'Aprovada'});if(error)throw error;await refreshAdmin();closeInvoiceModal();showAdminMessage('NF aprovada. Agora ela pode ser enviada ao cliente.','success');}catch(e){showAdminMessage(e.message||'Não foi possível aprovar a NF.','error');}finally{hidePageLoader();}};
    $('#invoiceSendBtn')?.addEventListener('click',()=>openInvoiceSend(order.id));
  } catch(e) {
    body.innerHTML=`<div class="invoice-admin-empty"><strong>Não foi possível abrir a NF.</strong><span>${escapeHtml(e.message||'Erro desconhecido.')}</span></div>`;
  }
}

function openInvoiceSend(orderId) {
  const order=adminOrders.find(o=>String(o.id)===String(orderId)); if(!order)return;
  const number=String(order.id).padStart(6,'0');
  const subject=`Nota Fiscal referente ao pedido #${number}`;
  const message=`Olá, ${order.customer?.full_name||'cliente'}!\n\nSegue em anexo a Nota Fiscal referente à sua compra realizada na BrenntagHub.\n\nAgradecemos pela preferência e permanecemos à disposição para qualquer dúvida.\n\nAtenciosamente,\nEquipe BrenntagHub`;
  openModal(`<h2>Enviar NF por e-mail</h2><p class="section-note">A NF é enviada separadamente do pedido. O pedido não será alterado.</p><form id="invoiceSendForm" class="form-grid"><label class="full">Destinatário<input value="${escapeHtml(order.customer_email||'')}" readonly></label><label class="full">Assunto<input name="subject" required value="${escapeHtml(subject)}"></label><label class="full">Mensagem<textarea name="message" rows="8" required>${escapeHtml(message)}</textarea></label><p class="section-note full">Anexo: ${escapeHtml(order.nf_file_name||`NF-${number}.pdf`)}</p><button class="primary-btn full" type="submit">Enviar NF</button></form>`);
  $('#invoiceSendForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);if(!confirm(`Enviar a NF do pedido #${number} para ${order.customer_email||'o cliente'}?`))return;showPageLoader('Enviando NF por e-mail...');try{const {data,error}=await db.functions.invoke('send-invoice-email',{body:{order_id:order.id,subject:String(fd.get('subject')||''),message:String(fd.get('message')||'')}});if(error)throw error;if(data?.error)throw new Error(data.error);closeModal();await refreshAdmin();showAdminMessage(`NF enviada para ${order.customer_email}.`,'success');}catch(err){showAdminMessage(err.message||'Não foi possível enviar a NF.','error');}finally{hidePageLoader();}};
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
      <div class="product-admin-info"><span class="product-cat">${escapeHtml(p.category)}</span><h4>${escapeHtml(p.name)}</h4><p><strong>Código:</strong> ${escapeHtml(p.product_code || 'Sem código')} · ${p.stock} unidades · ${brl(p.price)} ${p.active===false?'· Inativo':''}</p></div>
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
  const p = adminProducts.find(x => Number(x.id) === Number(id)) || { name:'', category:'', product_code:'', price:'', stock:0, icon:'⚙', image_url:'', description:'' };
  openModal(`
    <h2>${id ? 'Editar' : 'Cadastrar'} produto</h2>
    <form id="productForm" class="form-grid">
      <label>Nome<input name="name" required value="${escapeHtml(p.name)}"></label>
      <label>Código do produto<input name="product_code" required value="${escapeHtml(p.product_code || '')}" placeholder="Ex.: PROD-001"></label>
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
        product_code: values.product_code.trim(),
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

function initialBalanceForm() {
  if (![FINANCE_OWNER_ID, FINANCE_ADMIN_ID].includes(adminUser?.id)) {
    showAdminMessage('Apenas o proprietário pode alterar o saldo inicial.', 'error');
    return;
  }
  openModal(`
    <h2>Alterar saldo inicial</h2>
    <p class="section-note">Esta alteração é exclusiva do proprietário e não cria uma entrada ou saída financeira.</p>
    <form id="initialBalanceForm" class="form-grid">
      <label class="full">Saldo inicial
        <input name="value" type="text" inputmode="decimal" required value="${escapeHtml(financeInitialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}" placeholder="Ex.: 50000,00">
      </label>
      <div class="full finance-owner-warning">🔒 Somente o proprietário da conta pode salvar esta alteração.</div>
      <button class="primary-btn full" type="submit">Salvar saldo inicial</button>
    </form>
  `);
  $('#initialBalanceForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const raw = String(form.get('value') || '').trim();
    const value = Number(raw.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return showAdminMessage('Saldo inicial inválido.', 'error');
    showPageLoader('Salvando saldo inicial...');
    try {
      const { error } = await db.rpc('finance_set_initial_balance', { p_initial_balance: value });
      if (error) throw error;
      closeModal();
      await refreshAdmin();
      showAdminMessage('Saldo inicial atualizado.', 'success');
    } catch (error) {
      console.error(error);
      showAdminMessage(error.message || 'Não foi possível alterar o saldo inicial.', 'error');
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


function couponDateTimeLocal(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
function renderCoupons(){const box=$('#couponAdminGrid');if(!box)return;if(!adminCoupons.length){box.innerHTML=`<div class="coupon-admin-empty"><strong>Nenhum cupom cadastrado.</strong><span>Crie um cupom para oferecer desconto durante uma negociação.</span></div>`;return;}box.innerHTML=adminCoupons.map(c=>{const expired=c.expires_at&&new Date(c.expires_at)<new Date();const exhausted=c.max_uses!=null&&Number(c.uses_count||0)>=Number(c.max_uses);const active=c.active&&!expired&&!exhausted;const validity=c.expires_at?`Válido até ${new Date(c.expires_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}`:'Sem data de expiração';const uses=c.max_uses==null?`${c.uses_count||0} usos`:`${c.uses_count||0}/${c.max_uses} usos`;return `<article class="coupon-admin-card ${active?'':'inactive'}"><div class="coupon-admin-top"><div><span class="coupon-admin-code">${escapeHtml(c.code)}</span><span class="coupon-admin-status">${active?'ATIVO':'INATIVO'}</span></div><strong>${Number(c.discount_percent).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</strong></div><div class="coupon-admin-meta"><span>${validity}</span><span>${uses}</span></div><div class="coupon-admin-actions"><button type="button" class="secondary-btn" data-coupon-edit="${c.id}">Editar</button><button type="button" class="secondary-btn" data-coupon-toggle="${c.id}">${c.active?'Desativar':'Ativar'}</button><button type="button" class="danger-btn" data-coupon-delete="${c.id}">Excluir</button></div></article>`;}).join('');}
function openCouponForm(coupon=null){const isEdit=!!coupon;openModal(`<h2>${isEdit?'Editar cupom':'Criar cupom'}</h2><p class="section-note">Use códigos simples para negociações, por exemplo NEGOCIA10.</p><form id="couponForm" class="form-grid"><label>Código<input name="code" maxlength="40" required value="${escapeHtml(coupon?.code||'')}"></label><label>Desconto (%)<input name="discount" type="number" min="0.01" max="100" step="0.01" required value="${coupon?.discount_percent??''}"></label><label>Validade (opcional)<input name="expires" type="datetime-local" value="${couponDateTimeLocal(coupon?.expires_at)}"></label><label>Limite de usos (opcional)<input name="maxUses" type="number" min="1" step="1" value="${coupon?.max_uses??''}"></label><label class="full coupon-admin-check"><input name="active" type="checkbox" ${coupon?.active!==false?'checked':''}> Cupom ativo</label><button class="primary-btn full" type="submit">${isEdit?'Salvar alterações':'Criar cupom'}</button></form>`);$('#couponForm [name="code"]').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,''));$('#couponForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const expires=fd.get('expires'),maxUses=fd.get('maxUses');showPageLoader(isEdit?'Salvando cupom...':'Criando cupom...');try{const {error}=await db.rpc('admin_save_discount_coupon',{p_id:isEdit?coupon.id:null,p_code:String(fd.get('code')||'').trim().toUpperCase(),p_discount_percent:Number(fd.get('discount')),p_expires_at:expires?new Date(expires).toISOString():null,p_max_uses:maxUses?Number(maxUses):null,p_active:fd.get('active')==='on'});if(error)throw error;await refreshAdmin();closeModal();showAdminMessage(isEdit?'Cupom atualizado.':'Cupom criado.','success');}catch(err){showAdminMessage(err.message||'Não foi possível salvar o cupom.','error');}finally{hidePageLoader();}};}
async function deleteCoupon(id){if(!confirm('Excluir este cupom? Essa ação não poderá ser desfeita.'))return;showPageLoader('Excluindo cupom...');try{const {error}=await db.rpc('admin_delete_discount_coupon',{p_id:id});if(error)throw error;await refreshAdmin();showAdminMessage('Cupom excluído.','success');}catch(err){showAdminMessage(err.message||'Não foi possível excluir o cupom.','error');}finally{hidePageLoader();}}
async function toggleCoupon(id){const c=adminCoupons.find(x=>String(x.id)===String(id));if(!c)return;showPageLoader(c.active?'Desativando cupom...':'Ativando cupom...');try{const {error}=await db.rpc('admin_save_discount_coupon',{p_id:c.id,p_code:c.code,p_discount_percent:Number(c.discount_percent),p_expires_at:c.expires_at,p_max_uses:c.max_uses,p_active:!c.active});if(error)throw error;await refreshAdmin();showAdminMessage(c.active?'Cupom desativado.':'Cupom ativado.','success');}catch(err){showAdminMessage(err.message||'Não foi possível alterar o cupom.','error');}finally{hidePageLoader();}}

const DEFAULT_PROGRESSIVE_TIERS = [
  { min_value: 500, discount_percent: 2, active: true },
  { min_value: 1000, discount_percent: 4, active: true },
  { min_value: 2000, discount_percent: 6, active: true },
  { min_value: 5000, discount_percent: 8, active: true }
];

function normalizeProgressiveTiers(data) {
  const source = Array.isArray(data) ? data : [];
  if (!source.length) return DEFAULT_PROGRESSIVE_TIERS.map(t => ({ ...t }));

  const rows = source.slice(0, 4).map(t => ({
    id: t.id || null,
    min_value: Number(t.min_value ?? 0),
    discount_percent: Number(t.discount_percent ?? 0),
    active: t.active !== false
  }));

  while (rows.length < 4) {
    const fallback = DEFAULT_PROGRESSIVE_TIERS[rows.length];
    rows.push({ ...fallback });
  }
  return rows;
}

async function loadProgressiveTiers() {
  try {
    const { data, error } = await db.from('cart_discount_tiers').select('id,min_value,discount_percent,active').order('min_value', { ascending: true });
    if (error) throw error;
    progressiveTiers = normalizeProgressiveTiers(data);
  } catch (error) {
    progressiveTiers = DEFAULT_PROGRESSIVE_TIERS.map(t => ({ ...t }));
    console.warn('Faixas de desconto progressivo indisponíveis; usando as 4 faixas padrão:', error);
  }
}

function renderProgressiveTiers() {
  const body = $('#progressiveDiscountBody');
  if (!body) return;

  progressiveTiers = normalizeProgressiveTiers(progressiveTiers);
  body.innerHTML = progressiveTiers.map((tier, index) => `
    <tr>
      <td><input aria-label="Valor mínimo da faixa ${index + 1}" class="progressive-min" data-index="${index}" type="number" min="0" step="0.01" value="${Number(tier.min_value || 0)}"></td>
      <td><input aria-label="Desconto da faixa ${index + 1}" class="progressive-percent" data-index="${index}" type="number" min="0" max="100" step="0.01" value="${Number(tier.discount_percent || 0)}"></td>
      <td><label class="inline-check"><input aria-label="Ativar faixa ${index + 1}" class="progressive-active" data-index="${index}" type="checkbox" ${tier.active !== false ? 'checked' : ''}><span>Ativo</span></label></td>
    </tr>
  `).join('');
}

async function saveProgressiveTiers() {
  const rows = [...document.querySelectorAll('#progressiveDiscountBody tr')];
  if (!rows.length) {
    renderProgressiveTiers();
    return;
  }
  showPageLoader('Salvando descontos...');
  try {
    const payload = rows.map((row, index) => ({
      id: progressiveTiers[index]?.id || null,
      min_value: Number(row.querySelector('.progressive-min')?.value || 0),
      discount_percent: Number(row.querySelector('.progressive-percent')?.value || 0),
      active: row.querySelector('.progressive-active')?.checked !== false
    })).filter(x => Number.isFinite(x.min_value) && Number.isFinite(x.discount_percent) && x.min_value >= 0 && x.discount_percent >= 0 && x.discount_percent <= 100);
    if (payload.length !== 4) throw new Error('Configure as 4 faixas antes de salvar.');
    const { error } = await db.rpc('admin_save_progressive_tiers', { p_tiers: payload });
    if (error) throw error;
    await loadProgressiveTiers();
    renderProgressiveTiers();
    showAdminMessage('Descontos progressivos atualizados.', 'success');
  } catch (error) {
    showAdminMessage(error.message || 'Não foi possível salvar as faixas.', 'error');
  } finally {
    hidePageLoader();
  }
}

function renderReviews() {
  const body = $('#reviewsBody');
  const count = $('#reviewsCountLabel');
  if (!body) return;
  if (count) count.textContent = `${adminReviews.length} avaliações`;
  body.innerHTML = adminReviews.map(review => {
    const stars = '★'.repeat(Number(review.rating || 0)) + '☆'.repeat(5 - Number(review.rating || 0));
    return `<tr>
      <td>#${String(review.order_id).padStart(6,'0')}</td>
      <td>${new Date(review.created_at).toLocaleString('pt-BR')}<br><small>${escapeHtml(review.customer?.full_name || 'Cliente')}</small></td>
      <td><span class="review-stars-mini">${stars}</span></td>
      <td>${escapeHtml(review.comment || '—')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4">Nenhuma avaliação recebida ainda.</td></tr>';
}

function renderPaymentMethodsAdmin() {
  const target = $('#paymentMethodsAdmin');
  if (!target) return;
  target.innerHTML = paymentMethods.map(method => `
    <label class="payment-method-admin-card">
      <span>
        <strong>${escapeHtml(method.name)}</strong>
        <small>${method.code === 'pix' ? 'Pagamento instantâneo' : method.code === 'credit' ? 'Cartão de crédito' : 'Pagamento por boleto'}</small>
      </span>
      <input type="checkbox" class="payment-method-toggle" data-code="${escapeHtml(method.code)}" ${method.active ? 'checked' : ''}>
    </label>
  `).join('') || '<p class="section-note">Nenhuma forma de pagamento cadastrada.</p>';
}

async function savePaymentMethod(code, active) {
  const { error } = await db.rpc('admin_set_payment_method', {
    p_code: code,
    p_active: active
  });
  if (error) throw error;
  const item = paymentMethods.find(x => x.code === code);
  if (item) item.active = active;
  renderPaymentMethodsAdmin();
  showAdminMessage(`${item?.name || code} ${active ? 'ativado' : 'desativado'}.`, 'success');
}

async function refreshAdmin() {
  await loadAdminData();
  await loadProgressiveTiers();
  await loadShippingAdmin();
  renderDashboard(); renderOrders(); renderStock(); renderProducts(); renderFinance(); renderPaymentMethodsAdmin(); termsSection(); renderSupport(); renderCoupons(); renderReviews(); renderProgressiveTiers();
  $('#lastUpdate').textContent = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function go(id) {
  $$('.admin-section').forEach(section => section.classList.remove('current'));
  const section = $('#' + id + 'Section');
  if (!section) return;
  section.classList.add('current');
  $$('.nav-group a').forEach(link => link.classList.toggle('active', link.dataset.section === id));
  history.replaceState(null, '', '#' + id);
  if (id === 'descontosProgressivos') renderProgressiveTiers();
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
$('#editInitialBalance').onclick = () => initialBalanceForm();
$('#openTerms').onclick = () => termsForm();
$('#saveProgressiveDiscounts').onclick = () => saveProgressiveTiers();
$('#paymentMethodsAdmin')?.addEventListener('change', async event => {
  const input = event.target.closest('.payment-method-toggle');
  if (!input) return;
  input.disabled = true;
  try { await savePaymentMethod(input.dataset.code, input.checked); }
  catch (error) { input.checked = !input.checked; showAdminMessage(error.message || 'Não foi possível alterar a forma de pagamento.', 'error'); }
  finally { input.disabled = false; }
});
$('#openCoupon').onclick = () => openCouponForm();
$('#orderSearch').oninput = renderOrders;
$('#ordersBody').addEventListener('click', event => {
  const trigger = event.target.closest('[data-order-detail]');
  if (trigger) openOrderDetails(trigger.dataset.orderDetail);
});
$('#orderStatusFilter').onchange = renderOrders;
$('#stockSearch').oninput = renderStock;
$('#supportSearch').oninput = renderSupport;
$('#supportStatusFilter').onchange = renderSupport;

$('#supportAdminModal')?.addEventListener('click', event => { if(event.target.matches('[data-support-modal-close]')) closeSupportModal(); });
$('#invoiceAdminModal')?.addEventListener('click', event => { if(event.target.matches('[data-invoice-close]')) closeInvoiceModal(); });
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
  if (target.classList.contains('invoice-view')) return openInvoiceReview(Number(target.dataset.invoiceView));
  if (target.classList.contains('invoice-send')) return openInvoiceSend(Number(target.dataset.invoiceSend));
  if (target.classList.contains('delete-expense')) return deleteExpense(Number(id));
  if (target.dataset.couponEdit) return openCouponForm(adminCoupons.find(c=>String(c.id)===String(target.dataset.couponEdit)));
  if (target.dataset.couponDelete) return deleteCoupon(Number(target.dataset.couponDelete));
  if (target.dataset.couponToggle) return toggleCoupon(Number(target.dataset.couponToggle));
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
