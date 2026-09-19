const db = window.brenntagSupabase;
let products = [];
let cart = [];
let buyerOrders = [];
let currentTerms = null;

const grid = document.querySelector('#productGrid');
const filters = document.querySelector('#filters');

function showPageLoader(message = 'Processando...') {
  const loader = document.querySelector('#pageLoader');
  if (!loader) return;
  const text = loader.querySelector('#pageLoaderText');
  if (text) text.textContent = message;
  loader.classList.remove('hidden');
  loader.setAttribute('aria-busy', 'true');
}

function hidePageLoader() {
  const loader = document.querySelector('#pageLoader');
  if (!loader) return;
  loader.classList.add('hidden');
  loader.setAttribute('aria-busy', 'false');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('#appToast');
  existing?.remove();
  const toast = document.createElement('div');
  toast.id = 'appToast';
  toast.className = `app-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeProduct(row) {
  return {
    id: Number(row.id),
    name: row.name || '',
    cat: row.category || '',
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    icon: row.icon || '▥',
    image: row.image_url || '',
    desc: row.description || '',
    active: row.active !== false
  };
}

function productVisual(product) {
  if (product.image) {
    return `
      <img src="${product.image}" alt="${product.name}" class="product-real-image"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <span class="product-icon-fallback" style="display:none;">${product.icon || '▥'}</span>
    `;
  }
  return `<span class="product-icon-fallback">${product.icon || '▥'}</span>`;
}

async function loadProducts() {
  const { data, error } = await db
    .from('products')
    .select('*')
    .eq('active', true)
    .order('id', { ascending: true });

  if (error) throw error;
  products = (data || []).map(normalizeProduct);
  buildFilters();
  render();
}

function buildFilters() {
  const cats = ['Todos', ...new Set(products.map(p => p.cat).filter(Boolean))];
  filters.innerHTML = cats.map((c, i) => `
    <button class="filter ${i === 0 ? 'active' : ''}" data-cat="${c}">${c}</button>
  `).join('');
}

function render(list = products) {
  const source = Array.isArray(list) ? list : products;

  grid.innerHTML = source.map(p => {
    const stock = Number(p.stock || 0);
    const soldOut = stock <= 0;
    const lowStock = stock > 0 && stock <= 5;

    return `
      <article class="product ${soldOut ? 'is-out-of-stock' : ''}" data-id="${p.id}">
        ${soldOut ? '<div class="product-stock-banner">ESGOTADO</div>' : ''}
        <div class="product-img">
          ${productVisual(p)}
          ${p.image ? `
            <button type="button" class="image-preview-button" data-preview-id="${p.id}"
              title="Visualizar imagem" aria-label="Visualizar imagem de ${p.name}">⛶</button>
          ` : ''}
        </div>
        <div class="product-info">
          <span class="product-cat">${p.cat}</span>
          <h3>${p.name}</h3>
          <div class="price">R$ ${money(p.price)}</div>
          <div class="stock ${soldOut ? 'stock-out' : lowStock ? 'stock-low' : ''}">
            ${soldOut ? 'Produto esgotado' : lowStock ? `Últimas ${stock} unidades` : `${stock} unidades disponíveis`}
          </div>
        </div>
      </article>
    `;
  }).join('') || '<div class="buyer-orders-empty"><strong>Nenhum produto encontrado.</strong></div>';
}

async function refreshProducts() {
  try {
    await loadProducts();
    syncCartWithStock();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar os produtos.', 'error');
  }
}

function syncCartWithStock() {
  cart = cart
    .map(item => {
      const p = products.find(x => x.id === item.id);
      if (!p || p.stock <= 0) return null;
      return { id: item.id, quantity: Math.min(item.quantity, p.stock) };
    })
    .filter(Boolean)
    .filter(item => item.quantity > 0);
  updateCart();
}

function initSakura() {
  const layer = document.querySelector('#sakuraLayer');
  if (!layer) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 34; i++) {
    const petal = document.createElement('span');
    petal.className = 'sakura-petal';
    const size = 8 + Math.random() * 13;
    const duration = 8 + Math.random() * 10;
    petal.style.left = `${Math.random() * 100}%`;
    petal.style.setProperty('--size', `${size.toFixed(1)}px`);
    petal.style.setProperty('--duration', `${duration.toFixed(1)}s`);
    petal.style.setProperty('--delay', `${(-Math.random() * duration).toFixed(1)}s`);
    petal.style.setProperty('--drift1', `${-60 + Math.random() * 120}px`);
    petal.style.setProperty('--drift2', `${-120 + Math.random() * 240}px`);
    petal.style.setProperty('--drift3', `${-180 + Math.random() * 360}px`);
    petal.style.setProperty('--opacity', (.36 + Math.random() * .52).toFixed(2));
    petal.style.setProperty('--rot', `${Math.round(Math.random() * 360)}deg`);
    frag.appendChild(petal);
  }
  layer.appendChild(frag);
}

function initHeroNavigation() {
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    const sync = () => topbar.classList.toggle('scrolled', window.scrollY > 55);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
  }

  document.querySelectorAll('.hero-cta').forEach(button => {
    button.addEventListener('click', event => {
      const target = document.querySelector(button.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function openProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  document.querySelector('#productDetail').innerHTML = `
    <div class="detail product-detail-no-preview">
      <div class="product-img detail-product-image">${productVisual(p)}</div>
      <div class="product-detail-content">
        <span class="product-cat">${p.cat}</span>
        <h2>${p.name}</h2>
        <div class="price">R$ ${money(p.price)}</div>
        <p>${p.desc}</p>
        <p><b>Disponibilidade:</b> ${p.stock} unidades em estoque</p>
        <button class="buy" ${p.stock < 1 ? 'disabled' : ''} id="addDetailToCart">
          ${p.stock < 1 ? 'Sem estoque' : 'Adicionar ao carrinho'}
        </button>
      </div>
    </div>
  `;

  document.querySelector('#addDetailToCart')?.addEventListener('click', () => addToCart(p.id));
  document.querySelector('#productModal').classList.remove('hidden');
}

function openImagePreview(id) {
  const p = products.find(x => x.id === id);
  if (!p?.image) return;
  document.querySelector('#productDetail').innerHTML = `
    <div class="image-preview-modal-content">
      <p class="eyebrow">VISUALIZAÇÃO DO PRODUTO</p>
      <h2>${p.name}</h2>
      <div class="image-preview-large"><img src="${p.image}" alt="${p.name}"></div>
    </div>
  `;
  document.querySelector('#productModal').classList.remove('hidden');
}

function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p || p.stock < 1) {
    showToast('Este produto está esgotado.', 'error');
    return;
  }

  const existing = cart.find(item => item.id === id);
  if (existing) {
    if (existing.quantity >= p.stock) {
      showToast(`Só há ${p.stock} unidade(s) disponível(is).`, 'error');
      return;
    }
    existing.quantity += 1;
  } else {
    cart.push({ id, quantity: 1 });
  }

  updateCart();
  document.querySelector('#productModal').classList.add('hidden');
  showToast(`${p.name} adicionado ao carrinho.`, 'success');
}

function updateCart() {
  const count = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const target = document.querySelector('#cartCount');
  if (target) target.textContent = count;
}

function cartTotal() {
  return cart.reduce((sum, item) => {
    const p = products.find(x => x.id === item.id);
    return sum + (p ? p.price * item.quantity : 0);
  }, 0);
}

async function fetchSession() {
  const { data } = await db.auth.getSession();
  return data.session;
}

async function fetchCurrentUser() {
  const { data } = await db.auth.getUser();
  return data.user;
}

async function fetchTerms() {
  const { data, error } = await db
    .from('purchase_terms')
    .select('id,version,title,content,active')
    .eq('active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  currentTerms = data;
  return currentTerms;
}

function renderCart() {
  const detail = document.querySelector('#cartDetail');
  if (!detail) return;

  if (!cart.length) {
    detail.innerHTML = `
      <p class="eyebrow">PEDIDO</p>
      <h2>Seu carrinho</h2>
      <p>Seu carrinho está vazio.</p>
    `;
    return;
  }

  detail.innerHTML = `
    <p class="eyebrow">PEDIDO</p>
    <h2>Seu carrinho</h2>
    <div class="cart-list">
      ${cart.map(item => {
        const p = products.find(x => x.id === item.id);
        if (!p) return '';
        const subtotal = p.price * item.quantity;
        return `
          <div class="cart-item">
            <div class="cart-item-main">
              <div class="cart-item-thumb">${productVisual(p)}</div>
              <div>
                <strong>${p.name}</strong>
                <small>R$ ${money(p.price)} por unidade</small>
                <small class="cart-stock-warning">Disponível: ${p.stock}</small>
              </div>
            </div>
            <div class="cart-item-controls">
              <div class="qty-control">
                <button type="button" data-cart-action="decrease" data-id="${p.id}">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-action="increase" data-id="${p.id}">+</button>
              </div>
              <strong>R$ ${money(subtotal)}</strong>
              <button type="button" class="cart-remove" data-cart-action="remove" data-id="${p.id}">Remover</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="cart-summary"><span>Total</span><strong>R$ ${money(cartTotal())}</strong></div>
    <button class="buy" id="finishOrder">Continuar para finalizar</button>
  `;

  detail.querySelector('#finishOrder')?.addEventListener('click', openCheckout);
}

async function openCheckout() {
  if (!cart.length) return;

  const session = await fetchSession();
  if (!session) {
    document.querySelector('#cartModal').classList.add('hidden');
    showToast('Entre na sua conta para finalizar o pedido.', 'error');
    window.location.href = 'login.html?mode=login&redirect=checkout';
    return;
  }

  try {
    await fetchTerms();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar os termos de compra.', 'error');
    return;
  }

  const detail = document.querySelector('#cartDetail');
  const version = currentTerms?.version;

  detail.innerHTML = `
    <p class="eyebrow">FINALIZAÇÃO</p>
    <h2>Confirmar pedido</h2>
    <div class="checkout-summary">
      ${cart.map(item => {
        const p = products.find(x => x.id === item.id);
        return `<div><span>${item.quantity}x ${p.name}</span><strong>R$ ${money(p.price * item.quantity)}</strong></div>`;
      }).join('')}
    </div>
    <div class="cart-summary"><span>Total</span><strong>R$ ${money(cartTotal())}</strong></div>
    <div class="terms-box">
      <div class="terms-box-head">
        <strong>${currentTerms?.title || 'Termos de compra'}</strong>
        <span>Versão ${version}</span>
      </div>
      <p>Para concluir a compra, você precisa ler e aceitar as condições de compra, reembolso e cancelamento.</p>
      <button type="button" class="terms-link" id="readTerms">Ler os termos completos →</button>
      <label class="terms-check">
        <input type="checkbox" id="acceptTerms">
        <span>Li e concordo com os termos de compra, reembolso e cancelamento.</span>
      </label>
    </div>
    <button class="buy" id="confirmOrder">Finalizar pedido</button>
  `;

  detail.querySelector('#readTerms')?.addEventListener('click', showTermsModal);
  detail.querySelector('#confirmOrder')?.addEventListener('click', createOrderFromCart);
}

function showTermsModal() {
  if (!currentTerms) return;
  const modal = document.querySelector('#termsModal');
  const content = document.querySelector('#termsContent');
  content.innerHTML = `
    <p class="eyebrow">VERSÃO ${currentTerms.version}</p>
    <h2>${currentTerms.title}</h2>
    <div class="terms-full-content">${String(currentTerms.content).replace(/\n/g, '<br>')}</div>
  `;
  modal.classList.remove('hidden');
}

async function createOrderFromCart() {
  const checkbox = document.querySelector('#acceptTerms');
  if (!checkbox?.checked) {
    showToast('Você precisa aceitar os termos para finalizar.', 'error');
    return;
  }

  const session = await fetchSession();
  if (!session) {
    window.location.href = 'login.html?mode=login&redirect=checkout';
    return;
  }

  const items = cart.map(item => ({
    product_id: item.id,
    quantity: item.quantity
  }));

  const button = document.querySelector('#confirmOrder');
  button.disabled = true;
  showPageLoader('Finalizando pedido...');

  try {
    const { data: orderId, error } = await db.rpc('create_order', {
      p_items: items,
      p_terms_version: currentTerms.version
    });

    if (error) throw error;

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    cart = [];
    updateCart();
    document.querySelector('#cartModal').classList.add('hidden');
    await refreshProducts();
    await renderBuyerOrders();
    hidePageLoader();
    showReceipt(order);
  } catch (error) {
    console.error(error);
    hidePageLoader();
    button.disabled = false;
    showToast(error.message || 'Não foi possível finalizar o pedido.', 'error');
  }
}

async function renderBuyerOrders() {
  const container = document.querySelector('#buyerOrders');
  if (!container) return;

  const session = await fetchSession();
  if (!session) {
    container.innerHTML = `
      <div class="buyer-orders-empty">
        <strong>Entre para acompanhar seus pedidos.</strong>
        <span>Seu histórico fica ligado à sua conta e pode ser acessado em qualquer dispositivo.</span>
        <a class="buy buyer-login-link" href="login.html?mode=login&redirect=orders">Entrar ou criar conta</a>
      </div>
    `;
    return;
  }

  const { data, error } = await db
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    container.innerHTML = `<div class="buyer-orders-empty"><strong>Não foi possível carregar seus pedidos.</strong></div>`;
    return;
  }

  buyerOrders = data || [];

  if (!buyerOrders.length) {
    container.innerHTML = `
      <div class="buyer-orders-empty">
        <strong>Nenhum pedido realizado ainda.</strong>
        <span>Seus pedidos aparecerão aqui depois da finalização da compra.</span>
      </div>
    `;
    return;
  }

  const steps = ['Recebido', 'Em separação', 'Enviado', 'Concluído'];

  container.innerHTML = buyerOrders.map(order => {
    const currentIndex = steps.indexOf(order.status);
    const canceled = order.status === 'Cancelado';
    const totalUnits = (order.order_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const itemsText = order.order_items?.length === 1
      ? `${totalUnits}x ${order.order_items[0].product_name}`
      : `${order.order_items?.length || 0} produtos · ${totalUnits} unidades`;
    const canCancel = !canceled && ['Recebido', 'Em separação'].includes(order.status);
    const orderNumber = String(order.id).padStart(6, '0');

    return `
      <article class="buyer-order-card ${canceled ? 'is-canceled' : ''}">
        <div class="buyer-order-top">
          <div>
            <span class="buyer-order-label">PEDIDO</span>
            <strong>#${orderNumber}</strong>
            <small>${new Date(order.created_at).toLocaleDateString('pt-BR')} · ${new Date(order.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</small>
          </div>
          <div class="buyer-order-total"><span>Total</span><strong>R$ ${money(order.total)}</strong></div>
        </div>
        <div class="buyer-order-item">${itemsText}</div>
        ${canceled ? `
          <div class="buyer-order-canceled"><span>✕</span><div><strong>Pedido cancelado</strong><small>O estoque foi devolvido e o cancelamento foi registrado.</small></div></div>
        ` : `
          <div class="buyer-order-status-head">
            <strong>${order.status}</strong>
            <span>${currentIndex + 1} de 4 etapas</span>
          </div>
          <div class="buyer-order-progress">
            ${steps.map((step, index) => `
              <div class="buyer-step ${index <= currentIndex ? 'done' : ''} ${index === currentIndex ? 'current' : ''}">
                <div class="buyer-step-dot">${index < currentIndex ? '✓' : index + 1}</div>
                <span>${step}</span>
              </div>
              ${index < steps.length - 1 ? `<div class="buyer-step-line ${index < currentIndex ? 'done' : ''}"></div>` : ''}
            `).join('')}
          </div>
          ${canCancel ? `<button class="cancel-order-btn" data-cancel-order="${order.id}">Cancelar pedido</button>` : ''}
        `}
      </article>
    `;
  }).join('');
}

async function cancelBuyerOrder(orderId) {
  if (!window.confirm('Tem certeza que deseja cancelar este pedido?')) return;
  showPageLoader('Cancelando pedido...');
  try {
    const { error } = await db.rpc('cancel_order', { p_order_id: Number(orderId) });
    if (error) throw error;
    await refreshProducts();
    await renderBuyerOrders();
    hidePageLoader();
    showToast('Pedido cancelado com sucesso.', 'success');
  } catch (error) {
    console.error(error);
    hidePageLoader();
    showToast(error.message || 'Não foi possível cancelar o pedido.', 'error');
  }
}

function showReceipt(order) {
  const items = order.order_items || [];
  const orderNumber = String(order.id).padStart(6, '0');
  document.querySelector('#receiptDetail').innerHTML = `
    <div class="receipt-header">
      <div class="receipt-icon">✓</div>
      <div><p class="eyebrow">PAGAMENTO SIMULADO</p><h2>Pedido confirmado</h2><p class="receipt-subtitle">Seu pedido foi registrado com sucesso.</p></div>
    </div>
    <div class="receipt-status"><span class="status-dot"></span> Pedido recebido</div>
    <div class="receipt-number"><span>NÚMERO DO PEDIDO</span><strong>#${orderNumber}</strong></div>
    <div class="receipt-info">
      <div><span>Data</span><strong>${new Date(order.created_at).toLocaleDateString('pt-BR')}</strong></div>
      <div><span>Horário</span><strong>${new Date(order.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</strong></div>
      <div><span>Pagamento</span><strong>Pix</strong></div>
    </div>
    <div class="receipt-divider"></div>
    <p class="receipt-section-title">ITENS DO PEDIDO</p>
    <div class="receipt-items">
      ${items.map(item => `<div class="receipt-item"><span>${item.quantity}x ${item.product_name}</span><strong>R$ ${money(item.subtotal)}</strong></div>`).join('')}
    </div>
    <div class="receipt-total"><span>Total</span><strong>R$ ${money(order.total)}</strong></div>
    <div class="pix-box"><div class="pix-title"><span class="pix-symbol">◆</span><strong>Pagamento via Pix</strong></div><p>Este pedido utiliza uma simulação de pagamento para fins demonstrativos do marketplace.</p><div class="pix-code">PAGAMENTO-SIMULADO-${orderNumber}</div></div>
    <div class="receipt-actions">
      <button class="buy" id="downloadReceipt">Baixar comprovante PDF</button>
      <button class="buy" id="trackOrder">Acompanhar pedido</button>
      <button class="buy receipt-close" data-close>Fechar</button>
    </div>
  `;

  document.querySelector('#receiptModal').classList.remove('hidden');
  document.querySelector('#downloadReceipt').onclick = () => downloadReceiptPDF(order);
  document.querySelector('#trackOrder').onclick = () => {
    document.querySelector('#receiptModal').classList.add('hidden');
    document.querySelector('#orders').scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderBuyerOrders();
  };
}

function downloadReceiptPDF(order) {
  if (!window.jspdf?.jsPDF) return;
  const doc = new window.jspdf.jsPDF();
  const orderNumber = String(order.id).padStart(6, '0');
  let y = 20;
  doc.setFontSize(20); doc.setFont(undefined, 'bold'); doc.text('BRENNTAG', 20, y);
  y += 10; doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text('INDUSTRIAL MARKETPLACE', 20, y);
  y += 20; doc.setFontSize(18); doc.setFont(undefined, 'bold'); doc.text('COMPROVANTE DE PEDIDO', 20, y);
  y += 12; doc.setFontSize(11); doc.setFont(undefined, 'normal');
  doc.text(`Pedido: #${orderNumber}`, 20, y); y += 7;
  doc.text(`Data: ${new Date(order.created_at).toLocaleDateString('pt-BR')}`, 20, y); y += 7;
  doc.text(`Horário: ${new Date(order.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`, 20, y); y += 7;
  doc.text('Pagamento: Pix — Simulado', 20, y); y += 15;
  doc.line(20, y, 190, y); y += 12;
  doc.setFont(undefined, 'bold'); doc.text('ITENS DO PEDIDO', 20, y); y += 10; doc.setFont(undefined, 'normal');
  (order.order_items || []).forEach(item => { doc.text(`${item.quantity}x ${item.product_name}`, 20, y); doc.text(`R$ ${money(item.subtotal)}`, 150, y); y += 8; });
  y += 5; doc.line(20, y, 190, y); y += 12; doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(`TOTAL: R$ ${money(order.total)}`, 20, y);
  y += 20; doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text('Este documento é um comprovante de pedido com pagamento simulado.', 20, y);
  doc.save(`comprovante-pedido-${orderNumber}.pdf`);
}

filters.addEventListener('click', event => {
  const button = event.target.closest('[data-cat]');
  if (!button) return;
  document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
  button.classList.add('active');
  const category = button.dataset.cat;
  const query = document.querySelector('#searchInput').value.trim().toLowerCase();
  let list = category === 'Todos' ? products : products.filter(p => p.cat === category);
  if (query) list = list.filter(p => `${p.name} ${p.cat}`.toLowerCase().includes(query));
  render(list);
});

document.querySelector('#searchInput')?.addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  const active = document.querySelector('.filter.active')?.dataset.cat || 'Todos';
  let list = active === 'Todos' ? products : products.filter(p => p.cat === active);
  render(query ? list.filter(p => `${p.name} ${p.cat}`.toLowerCase().includes(query)) : list);
});

grid.addEventListener('click', event => {
  const previewButton = event.target.closest('.image-preview-button');
  if (previewButton) {
    event.stopPropagation();
    openImagePreview(Number(previewButton.dataset.previewId));
    return;
  }
  const card = event.target.closest('.product');
  if (card) openProduct(Number(card.dataset.id));
});

document.querySelector('#cartButton').onclick = () => {
  renderCart();
  document.querySelector('#cartModal').classList.remove('hidden');
};

document.querySelector('#cartDetail').addEventListener('click', event => {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.cartAction;
  const item = cart.find(x => x.id === id);
  const p = products.find(x => x.id === id);
  if (!item || !p) return;

  if (action === 'increase') {
    if (item.quantity >= p.stock) return showToast(`Só há ${p.stock} unidade(s) disponível(is).`, 'error');
    item.quantity++;
  }
  if (action === 'decrease') {
    item.quantity--;
    if (item.quantity <= 0) cart = cart.filter(x => x.id !== id);
  }
  if (action === 'remove') cart = cart.filter(x => x.id !== id);
  updateCart();
  renderCart();
});

document.querySelector('#buyerOrders')?.addEventListener('click', event => {
  const button = event.target.closest('[data-cancel-order]');
  if (button) cancelBuyerOrder(button.dataset.cancelOrder);
});

document.querySelectorAll('[data-close]').forEach(button => {
  button.onclick = () => button.closest('.modal')?.classList.add('hidden');
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
});

async function initRealtime() {
  try {
    db.channel('brenntag-store')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
        await refreshProducts();
        await renderBuyerOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        await renderBuyerOrders();
      })
      .subscribe();
  } catch (error) {
    console.warn('Realtime indisponível:', error);
  }
}

async function init() {
  initSakura();
  initHeroNavigation();
  if (!window.brenntagSupabaseConfigured || !db) {
    showPageLoader('Configuração do Supabase pendente...');
    await wait(500);
    hidePageLoader();
    showToast('Cole a URL e a Publishable Key em supabase-config.js.', 'error');
    return;
  }

  showPageLoader('Carregando Brenntag...');
  try {
    await loadProducts();
    await renderBuyerOrders();
    await initRealtime();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Não foi possível carregar a loja.', 'error');
  } finally {
    await wait(500);
    hidePageLoader();
  }
}

init();

// Atendimento comercial — triagem inicial, protocolo e conversa com a equipe
(function initSupportChat(){
  const button=document.querySelector('#supportButton');
  const modal=document.querySelector('#supportModal');
  const messages=document.querySelector('#supportMessages');
  const composer=document.querySelector('#supportComposer');
  const protocolCard=document.querySelector('#supportProtocolCard');
  const protocolEl=document.querySelector('#supportProtocol');
  if(!button||!modal||!messages||!composer) return;
  const KEY='brenntagSupportSession';
  let state={step:0,type:'',name:'',email:'',document:'',protocol:'',id:null,token:null,closed:false};
  let poll=null;
  let supportChannel=null;
  let sending=false;
  let knownMessageIds=new Set();
  const time=d=>new Date(d||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const esc=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const add=(who,text,when,messageId=null)=>{const el=document.createElement('div');
const side=who==='client'||who==='user'?'user':'assistant';
el.className=`support-message ${side} ${who}`;
if(messageId!=null) el.dataset.messageId=String(messageId);
const label=who==='assistant'?'Assistente':who==='admin'?'Atendente':'Você';el.innerHTML=`<div class="support-bubble">${text}</div><span class="support-meta">${label} · ${time(when)}</span>`;messages.appendChild(el);messages.scrollTop=messages.scrollHeight;};
  const input=(placeholder,submit,type='text')=>{const isEmail=type==='email';composer.innerHTML=`<div class="support-input-row"><input class="support-input" id="supportInput" type="${isEmail?'email':'text'}" inputmode="${isEmail?'email':'text'}" autocomplete="${isEmail?'email':'off'}" autocapitalize="${isEmail?'none':'sentences'}" spellcheck="${isEmail?'false':'true'}" placeholder="${placeholder}"></div><div class="support-input-actions"><button class="support-send" id="supportSend">➜</button></div><p class="support-note">Seus dados são usados para registrar este atendimento.</p>`;const i=document.querySelector('#supportInput');const go=()=>{const v=i.value.trim();if(!v)return;if(isEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){i.setCustomValidity('Digite um e-mail válido, como nome@empresa.com.');i.reportValidity();return;}submit(v);};document.querySelector('#supportSend').onclick=go;i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}});i.addEventListener('input',()=>i.setCustomValidity(''));i.focus();};
  const choices=items=>{composer.innerHTML=`<div class="support-choice-row">${items.map(x=>`<button class="support-choice primary-choice" data-choice="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;composer.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>select(b.dataset.choice));};
  async function create(){
    const makeToken=()=>{if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID(); const a=new Uint8Array(16); if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(a); else for(let i=0;i<16;i++)a[i]=Math.floor(Math.random()*256); a[6]=(a[6]&15)|64; a[8]=(a[8]&63)|128; return [...a].map((b,i)=>[4,6,8,10].includes(i)?b.toString(16).padStart(2,'0'):b.toString(16).padStart(2,'0')).join('').replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5');};
    state.token=makeToken();
    const {data,error}=await db.rpc('open_brenntag_support',{p_client_type:state.type,p_full_name:state.name,p_email:state.email,p_document:state.document,p_client_token:state.token});
    if(error) throw new Error(error.message || 'Falha ao registrar atendimento');
    const row=Array.isArray(data)?data[0]:data;
    if(!row||!row.attendance_id||!row.protocol) throw new Error('O Supabase não retornou o protocolo do atendimento.');
    state.id=row.attendance_id; state.protocol=row.protocol; protocolEl.textContent=state.protocol; protocolCard.classList.remove('hidden'); localStorage.setItem(KEY,JSON.stringify(state));
  }
  async function sendClient(text){
    const {error}=await db.rpc('add_support_message',{p_client_token:state.token,p_attendance_id:state.id,p_sender:'client',p_message:text});
    if(error) throw error;

    // A RPC existente retorna apenas boolean. Buscamos a linha recém-criada para
    // obter o ID real do banco e registrar a mensagem localmente com esse ID.
    const {data,error:readError}=await db.rpc('get_support_messages',{p_client_token:state.token,p_attendance_id:state.id});
    if(readError) throw readError;
    const list=data||[];
    const created=list.slice().reverse().find(m=>m.sender==='client' && m.message===text);
    if(created){
      const id=String(created.id);
      if(knownMessageIds.has(id) || messages.querySelector(`[data-message-id="${id}"]`)) return;
      knownMessageIds.add(id);
      add(created.sender,created.message,created.created_at,created.id);
    }
  }
  async function loadMessages(){
    if(!state.id||!state.token)return;
    const {data,error}=await db.rpc('get_support_messages',{p_client_token:state.token,p_attendance_id:state.id});
    if(error)return;
    messages.innerHTML=''; knownMessageIds=new Set();
    (data||[]).forEach(m=>{knownMessageIds.add(String(m.id));add(m.sender,m.message,m.created_at,m.id);});
  }
  function startRealtime(){
    if(supportChannel) db.removeChannel(supportChannel);
    supportChannel=db.channel('client-support-'+state.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages',filter:`attendance_id=eq.${state.id}`},payload=>{
        const m=payload.new;
        if(!m||knownMessageIds.has(String(m.id))) return;
        knownMessageIds.add(String(m.id));
        if(messages.querySelector(`[data-message-id="${String(m.id)}"]`)) return;
        add(m.sender,m.message,m.created_at,m.id);
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_attendances',filter:`id=eq.${state.id}`},payload=>{
        const next=payload.new;
        if(!next) return;
        state.closed=next.status==='Encerrado';
        localStorage.setItem(KEY,JSON.stringify(state));
        if(state.closed) renderClosedComposer();
      })
      .subscribe();
  }
  function stopRealtime(){if(supportChannel){db.removeChannel(supportChannel);supportChannel=null;}}
  async function select(v){
    add('user',esc(v));
    if(state.step===0){state.type=v;state.step=1;add('assistant','Perfeito. Para registrar seu atendimento, qual é o seu <b>nome completo</b>?');input('Digite seu nome completo…',async name=>{state.name=name;state.step=2;add('user',esc(name));add('assistant','Obrigado, '+esc(name)+'. Agora informe seu <b>e-mail</b> para contato.');input('seuemail@empresa.com',async email=>{state.email=email;state.step=3;add('user',esc(email));const label=state.type==='Pessoa Jurídica'?'CNPJ':'CPF';add('assistant',`Certo. Agora informe seu <b>${label}</b>.`);input(`Digite seu ${label}…`,async doc=>{state.document=doc;add('user',esc(doc));try{await create();await loadMessages();startRealtime();add('assistant',`Tudo certo, <b>${esc(state.name)}</b>. Seu atendimento foi registrado sob o protocolo <b>${state.protocol}</b>.`);state.step=4;setTimeout(()=>{add('assistant','Agora me conte: <b>qual é a sua dúvida ou o que você precisa negociar com a nossa equipe?</b>');freeChat();},250);}catch(e){add('assistant','Não consegui registrar o atendimento. Tente novamente em alguns segundos.');console.error('Erro ao registrar atendimento:',e);showToast(e?.message || 'Erro ao registrar atendimento', 'error');}});});});}
  }
  function renderClosedComposer(){
    composer.innerHTML=`<div class="support-summary support-summary-closed"><strong>Atendimento finalizado</strong><span>Protocolo ${esc(state.protocol)}</span></div><div class="support-closed-actions"><span>Este atendimento foi finalizado.</span></div>`;
  }
  async function finalizeClientAttendance(){
    if(!state.id||!state.token||state.closed) return;
    const confirmed=window.confirm('Deseja Finalizar esse atendimento?');
    if(!confirmed) return;
    try{
      const {error}=await db.rpc('client_finalize_support',{p_client_token:state.token,p_attendance_id:state.id});
      if(error) throw error;
      state.closed=true;
      localStorage.setItem(KEY,JSON.stringify(state));
      renderClosedComposer();
      showToast('Atendimento finalizado.','success');
    }catch(e){
      console.error('Erro ao finalizar atendimento:',e);
      showToast(e?.message||'Não foi possível finalizar o atendimento.','error');
    }
  }
  function freeChat(){
    if(state.closed){renderClosedComposer();return;}
    composer.innerHTML=`<div class="support-summary"><strong>Atendimento aberto</strong><span>Protocolo ${esc(state.protocol)}</span></div><div class="support-input-row"><textarea class="support-input" id="supportInput" placeholder="Escreva sua dúvida ou necessidade…" rows="1"></textarea><button class="support-send" id="supportSend" type="button">➜</button></div><div class="support-footer-actions"><p class="support-note">Enter envia · Shift + Enter quebra a linha</p><button class="support-finish" id="supportFinish" type="button">Finalizar Atendimento</button></div>`;
    const i=document.querySelector('#supportInput'); const btn=document.querySelector('#supportSend');
    const go=async()=>{
      if(sending) return;
      const v=i.value.trim(); if(!v) return;
      sending=true; i.disabled=true; btn.disabled=true;
      i.value='';
      try{await sendClient(v);}
      catch(e){console.error('Erro ao enviar mensagem:',e);showToast(e?.message||'Não foi possível enviar a mensagem.','error');add('assistant','Não consegui enviar sua mensagem. Tente novamente.');i.value=v;}
      finally{sending=false;i.disabled=false;btn.disabled=false;i.focus();}
    };
    btn.onclick=go; i.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go();}});
    document.querySelector('#supportFinish').onclick=finalizeClientAttendance;
    i.focus();
  }
  function startPoll(){clearInterval(poll);poll=null;}
  function reset(){clearInterval(poll);stopRealtime();sending=false;knownMessageIds=new Set();state={step:0,type:'',name:'',email:'',document:'',protocol:'',id:null,token:null,closed:false};messages.innerHTML='';protocolCard.classList.add('hidden');composer.innerHTML='';add('assistant','Olá! Seja bem-vindo ao <b>atendimento comercial da BRENNTAG</b>.');setTimeout(()=>add('assistant','Antes de começarmos, preciso de alguns dados para registrar seu atendimento.'),120);setTimeout(()=>{add('assistant','Você é <b>Pessoa Física</b> ou <b>Pessoa Jurídica</b>?');choices(['Pessoa Física','Pessoa Jurídica']);},280);}
  button.onclick=()=>{modal.classList.remove('hidden');if(state.id){loadMessages().then(()=>{startRealtime();protocolEl.textContent=state.protocol;protocolCard.classList.remove('hidden');if(state.step>=4){state.closed?renderClosedComposer():freeChat();}});}else{reset();}};
})();
