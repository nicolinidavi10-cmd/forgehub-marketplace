const db = window.brenntagSupabase;
let products = [];
let cart = [];
let buyerOrders = [];
let currentTerms = null;
let currentCoupon = null;
let currentProgressiveDiscount = null;
let activePaymentMethods = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

async function previewProgressiveDiscount(subtotal = cartTotal()) {
  try {
    const { data, error } = await db.rpc('preview_progressive_cart_discount', {
      p_subtotal: Number(subtotal || 0)
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    currentProgressiveDiscount = row ? {
      minValue: Number(row.min_value || 0),
      percent: Number(row.discount_percent || 0),
      discount: Number(row.discount_amount || 0),
      total: Number(row.total || subtotal),
      nextMinValue: row.next_min_value == null ? null : Number(row.next_min_value),
      nextPercent: row.next_discount_percent == null ? null : Number(row.next_discount_percent)
    } : null;
    return currentProgressiveDiscount;
  } catch (error) {
    // O recurso fica desativado até o patch SQL ser aplicado.
    currentProgressiveDiscount = null;
    console.warn('Desconto progressivo indisponível:', error);
    return null;
  }
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

async function renderCart() {
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

  const subtotal = cartTotal();
  const progressive = await previewProgressiveDiscount(subtotal);
  const progressText = progressive?.percent
    ? (progressive.nextMinValue != null
      ? `Faltam R$ ${money(Math.max(0, progressive.nextMinValue - subtotal))} para chegar a ${progressive.nextPercent}% de desconto.`
      : `Você alcançou ${progressive.percent}% de desconto progressivo.`)
    : '';

  detail.innerHTML = `
    <p class="eyebrow">PEDIDO</p>
    <h2>Seu carrinho</h2>
    <div class="cart-list">
      ${cart.map(item => {
        const p = products.find(x => x.id === item.id);
        if (!p) return '';
        const itemSubtotal = p.price * item.quantity;
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
              <strong>R$ ${money(itemSubtotal)}</strong>
              <button type="button" class="cart-remove" data-cart-action="remove" data-id="${p.id}">Remover</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    ${progressive?.percent ? `
      <div class="progressive-discount-box">
        <div><span>Desconto progressivo</span><strong>${progressive.percent}% · - R$ ${money(progressive.discount)}</strong></div>
        <small>${progressText}</small>
      </div>
    ` : ''}
    <div class="cart-summary">
      <span>Subtotal</span><strong>R$ ${money(subtotal)}</strong>
      ${progressive?.percent ? `<span class="discount-line">Desconto progressivo</span><strong class="discount-line">- R$ ${money(progressive.discount)}</strong><span>Total</span><strong>R$ ${money(progressive.total)}</strong>` : ''}
    </div>
    <button class="buy" id="finishOrder">Continuar para finalizar</button>
  `;

  detail.querySelector('#finishOrder')?.addEventListener('click', openCheckout);
}

async function fetchActivePaymentMethods() {
  const { data, error } = await db
    .from('payment_methods')
    .select('code,name')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  activePaymentMethods = data || [];
  return activePaymentMethods;
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
    await fetchActivePaymentMethods();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar as opções de finalização da compra.', 'error');
    return;
  }

  if (!activePaymentMethods.length) {
    showToast('Nenhuma forma de pagamento está disponível no momento.', 'error');
    return;
  }

  const detail = document.querySelector('#cartDetail');
  const version = currentTerms?.version;
  currentCoupon = null;
  const subtotal = cartTotal();
  const progressive = await previewProgressiveDiscount(subtotal);

  const paymentOptions = activePaymentMethods.map((method, index) => `
    <label class="payment-option ${index === 0 ? 'selected' : ''}">
      <input type="radio" name="paymentMethod" value="${escapeHtml(method.code)}" ${index === 0 ? 'checked' : ''}>
      <span class="payment-option-copy">
        <strong>${escapeHtml(method.name)}</strong>
        <small>${method.code === 'pix' ? 'Pagamento instantâneo' : method.code === 'credit' ? 'Cartão de crédito' : 'Pagamento por boleto'}</small>
      </span>
    </label>
  `).join('');

  detail.innerHTML = `
    <p class="eyebrow">FINALIZAÇÃO</p>
    <h2>Confirmar pedido</h2>
    <div class="checkout-summary">
      ${cart.map(item => {
        const p = products.find(x => x.id === item.id);
        return `<div><span>${item.quantity}x ${escapeHtml(p?.name || 'Produto')}</span><strong>R$ ${money((p?.price || 0) * item.quantity)}</strong></div>`;
      }).join('')}
    </div>

    <div class="checkout-section">
      <div class="checkout-section-head"><strong>Endereço de entrega</strong><span>Obrigatório</span></div>
      <div class="checkout-address-grid">
        <label>CEP<input id="shippingCep" maxlength="9" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" required></label>
        <label>Estado<input id="shippingState" maxlength="2" autocomplete="address-level1" placeholder="ES" required></label>
        <label class="full">Cidade<input id="shippingCity" autocomplete="address-level2" placeholder="Ex.: Vila Velha" required></label>
        <label class="full">Rua<input id="shippingStreet" autocomplete="street-address" placeholder="Nome da rua" required></label>
        <label>Número<input id="shippingNumber" maxlength="20" placeholder="123" required></label>
        <label>Bairro<input id="shippingNeighborhood" autocomplete="address-line3" placeholder="Bairro" required></label>
        <label class="full">Complemento <span class="optional-label">(opcional)</span><input id="shippingComplement" maxlength="120" placeholder="Apto, sala, bloco..."></label>
      </div>
    </div>

    <div class="checkout-section">
      <div class="checkout-section-head"><strong>Forma de pagamento</strong><span>Obrigatório</span></div>
      <div class="payment-options" id="paymentOptions">${paymentOptions}</div>
    </div>

    <div class="coupon-box">
      <div class="coupon-box-head"><strong>Tem um cupom de desconto?</strong><span>Opcional</span></div>
      <div class="coupon-row">
        <input id="couponInput" type="text" maxlength="40" autocomplete="off" placeholder="Digite seu cupom">
        <button type="button" class="coupon-apply" id="applyCoupon">Aplicar</button>
      </div>
      <div class="coupon-feedback" id="couponFeedback"></div>
    </div>

    <div class="cart-summary checkout-prices">
      <span>Subtotal</span><strong id="checkoutSubtotal">R$ ${money(subtotal)}</strong>
      ${progressive?.percent ? `<span class="discount-line" id="progressiveDiscountLabel">Desconto progressivo (${progressive.percent}%)</span><strong class="discount-line" id="progressiveDiscount">- R$ ${money(progressive.discount)}</strong>` : ''}
      <span class="discount-line hidden" id="checkoutDiscountLabel">Cupom</span><strong class="discount-line hidden" id="checkoutDiscount">- R$ 0,00</strong>
      <span>Total</span><strong id="checkoutTotal">R$ ${money(progressive?.total ?? subtotal)}</strong>
    </div>

    ${progressive?.percent ? `<div class="progressive-discount-box compact"><small>${progressive.nextMinValue != null ? `Faltam R$ ${money(Math.max(0, progressive.nextMinValue - subtotal))} para chegar a ${progressive.nextPercent}%.` : `Você alcançou a maior faixa de desconto progressivo.`}</small></div>` : ''}

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

  detail.querySelectorAll('input[name="paymentMethod"]').forEach(input => input.addEventListener('change', () => {
    detail.querySelectorAll('.payment-option').forEach(option => option.classList.remove('selected'));
    input.closest('.payment-option')?.classList.add('selected');
  }));

  const cepInput = detail.querySelector('#shippingCep');
  cepInput?.addEventListener('input', () => {
    const digits = cepInput.value.replace(/\D/g, '').slice(0, 8);
    cepInput.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  });

  detail.querySelector('#readTerms')?.addEventListener('click', showTermsModal);
  detail.querySelector('#applyCoupon')?.addEventListener('click', applyCheckoutCoupon);
  detail.querySelector('#couponInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); applyCheckoutCoupon(); }
  });
  detail.querySelector('#confirmOrder')?.addEventListener('click', createOrderFromCart);
}

function progressiveBaseForCoupon() {
  const subtotal = cartTotal();
  const progressiveDiscount = Number(currentProgressiveDiscount?.discount || 0);
  return Math.max(0, subtotal - progressiveDiscount);
}

async function applyCheckoutCoupon() {
  const input = document.querySelector('#couponInput');
  const button = document.querySelector('#applyCoupon');
  const feedback = document.querySelector('#couponFeedback');
  const code = input?.value.trim().toUpperCase();
  if (!code) {
    currentCoupon = null;
    feedback.textContent = 'Digite um cupom para aplicar.';
    feedback.className = 'coupon-feedback error';
    return;
  }

  button.disabled = true;
  input.disabled = true;
  feedback.textContent = 'Validando cupom...';
  feedback.className = 'coupon-feedback';

  try {
    const { data, error } = await db.rpc('preview_discount_coupon', {
      p_code: code,
      p_subtotal: cartTotal()
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Cupom inválido.');

    const subtotal = cartTotal();
    const couponPercent = Number(row.discount_percent || 0);
    const couponDiscount = Math.round(subtotal * couponPercent) / 100;
    const progressiveDiscount = Number(currentProgressiveDiscount?.discount || 0);

    // Os descontos não acumulam: somente o maior desconto é aplicado.
    if (progressiveDiscount >= couponDiscount) {
      currentCoupon = null;
      document.querySelector('#checkoutDiscountLabel')?.classList.add('hidden');
      document.querySelector('#checkoutDiscount')?.classList.add('hidden');
      document.querySelector('#progressiveDiscountLabel')?.classList.remove('hidden');
      document.querySelector('#progressiveDiscount')?.classList.remove('hidden');
      document.querySelector('#checkoutTotal').textContent = `R$ ${money(Math.max(0, subtotal - progressiveDiscount))}`;
      feedback.textContent = `O desconto progressivo de ${currentProgressiveDiscount?.percent || 0}% é maior ou igual a este cupom. Os descontos não são acumulados.`;
      feedback.className = 'coupon-feedback error';
      return;
    }

    currentCoupon = {
      code: row.code,
      percent: couponPercent,
      discount: couponDiscount,
      total: Math.max(0, subtotal - couponDiscount)
    };

    document.querySelector('#progressiveDiscountLabel')?.classList.add('hidden');
    document.querySelector('#progressiveDiscount')?.classList.add('hidden');
    document.querySelector('#checkoutDiscountLabel')?.classList.remove('hidden');
    document.querySelector('#checkoutDiscount')?.classList.remove('hidden');
    document.querySelector('#checkoutDiscountLabel').textContent = `Cupom (${currentCoupon.percent}%)`;
    document.querySelector('#checkoutDiscount').textContent = `- R$ ${money(currentCoupon.discount)}`;
    document.querySelector('#checkoutTotal').textContent = `R$ ${money(currentCoupon.total)}`;
    feedback.textContent = `Cupom ${currentCoupon.code} aplicado. Ele substituiu o desconto progressivo porque oferece um desconto maior.`;
    feedback.className = 'coupon-feedback success';
  } catch (error) {
    currentCoupon = null;
    document.querySelector('#checkoutDiscountLabel')?.classList.add('hidden');
    document.querySelector('#checkoutDiscount')?.classList.add('hidden');
    document.querySelector('#progressiveDiscountLabel')?.classList.remove('hidden');
    document.querySelector('#progressiveDiscount')?.classList.remove('hidden');
    document.querySelector('#checkoutTotal').textContent = `R$ ${money(currentProgressiveDiscount?.total ?? cartTotal())}`;
    feedback.textContent = error.message || 'Não foi possível aplicar o cupom.';
    feedback.className = 'coupon-feedback error';
  } finally {
    button.disabled = false;
    input.disabled = false;
  }
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

  const getValue = id => String(document.querySelector(id)?.value || '').trim();
  const shippingCep = getValue('#shippingCep');
  const shippingState = getValue('#shippingState').toUpperCase();
  const shippingCity = getValue('#shippingCity');
  const shippingStreet = getValue('#shippingStreet');
  const shippingNumber = getValue('#shippingNumber');
  const shippingNeighborhood = getValue('#shippingNeighborhood');
  const shippingComplement = getValue('#shippingComplement');
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;

  if (!/^\d{5}-?\d{3}$/.test(shippingCep)) {
    showToast('Informe um CEP válido.', 'error');
    return;
  }
  if (!/^[A-Z]{2}$/.test(shippingState) || !shippingCity || !shippingStreet || !shippingNumber || !shippingNeighborhood) {
    showToast('Preencha todos os campos obrigatórios do endereço.', 'error');
    return;
  }
  if (!paymentMethod) {
    showToast('Selecione uma forma de pagamento.', 'error');
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
      p_terms_version: currentTerms.version,
      p_shipping_cep: shippingCep,
      p_shipping_state: shippingState,
      p_shipping_city: shippingCity,
      p_shipping_street: shippingStreet,
      p_shipping_number: shippingNumber,
      p_shipping_neighborhood: shippingNeighborhood,
      p_shipping_complement: shippingComplement || null,
      p_payment_method: paymentMethod
    });

    if (error) throw error;

    if (currentProgressiveDiscount?.percent) {
      const { error: progressiveError } = await db.rpc('apply_progressive_order_discount', {
        p_order_id: orderId
      });
      if (progressiveError) {
        await db.rpc('cancel_order', { p_order_id: orderId });
        throw progressiveError;
      }
    }

    if (currentCoupon?.code) {
      const { error: couponError } = await db.rpc('apply_discount_coupon', {
        p_order_id: orderId,
        p_code: currentCoupon.code
      });
      if (couponError) {
        await db.rpc('cancel_order', { p_order_id: orderId });
        throw couponError;
      }
    }

    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    await uploadInvoiceDraft(order, session);

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


async function generateInvoiceDraftPDF(order, session) {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca de PDF não carregada.');
  const doc = new window.jspdf.jsPDF();
  const orderNumber = String(order.id).padStart(6, '0');
  const user = session?.user;
  const customerName = user?.user_metadata?.full_name || 'Cliente';
  const customerEmail = user?.email || '';
  let y = 18;

  doc.setFontSize(18); doc.setFont(undefined, 'bold'); doc.text('BRENNTAG', 14, y);
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.text('INDUSTRIAL MARKETPLACE', 14, y + 6);
  doc.setFontSize(15); doc.setFont(undefined, 'bold'); doc.text('DOCUMENTO DE VENDA / NF', 14, y + 20);
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('RASCUNHO — PENDENTE DE REVISÃO ADMINISTRATIVA', 14, y + 27);
  y += 42;

  doc.setDrawColor(160); doc.rect(14, y - 5, 182, 28);
  doc.setFont(undefined, 'bold'); doc.text(`Pedido #${orderNumber}`, 18, y + 3);
  doc.setFont(undefined, 'normal');
  doc.text(`Emissão: ${new Date(order.created_at).toLocaleString('pt-BR')}`, 18, y + 10);
  doc.text(`Pagamento: ${String(order.payment_method_name || order.payment_method || 'Não informado')} — Simulado`, 18, y + 17);
  doc.text(`E-mail: ${customerEmail || 'não informado'}`, 105, y + 10);
  y += 36;

  doc.setFont(undefined, 'bold'); doc.text('DESTINATÁRIO', 14, y);
  doc.setFont(undefined, 'normal');
  doc.text(`Nome: ${customerName}`, 14, y + 7);
  doc.text(`E-mail: ${customerEmail || 'não informado'}`, 14, y + 14);
  y += 25;

  doc.setFont(undefined, 'bold'); doc.text('ITENS DA VENDA', 14, y);
  y += 7;
  doc.line(14, y, 196, y); y += 7;
  doc.setFont(undefined, 'bold'); doc.text('Produto', 14, y); doc.text('Qtd.', 130, y); doc.text('Valor', 165, y);
  y += 6; doc.setFont(undefined, 'normal');
  for (const item of (order.order_items || [])) {
    const name = String(item.product_name || '').slice(0, 58);
    doc.text(name, 14, y);
    doc.text(String(item.quantity || 0), 132, y);
    doc.text(`R$ ${money(item.subtotal)}`, 165, y);
    y += 7;
    if (y > 260) { doc.addPage(); y = 20; }
  }
  doc.line(14, y + 2, 196, y + 2); y += 12;
  const subtotal = Number(order.subtotal ?? (order.order_items || []).reduce((s,i)=>s+Number(i.subtotal||0),0));
  doc.text(`Subtotal`, 125, y); doc.text(`R$ ${money(subtotal)}`, 165, y); y += 7;
  if (order.coupon_code) {
    doc.text(`Cupom ${order.coupon_code} (${Number(order.discount_percent||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}%)`, 90, y);
    doc.text(`- R$ ${money(order.discount_amount)}`, 165, y); y += 7;
  }
  doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(`TOTAL: R$ ${money(order.total)}`, 125, y);
  y += 15; doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('Documento gerado automaticamente pelo marketplace e sujeito à revisão administrativa.', 14, y);
  doc.text('Sem valor fiscal até a conferência e validação da equipe responsável.', 14, y + 6);
  return doc.output('blob');
}

async function uploadInvoiceDraft(order, session) {
  try {
    const blob = await generateInvoiceDraftPDF(order, session);
    const userId = session?.user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');
    const orderNumber = String(order.id).padStart(6, '0');
    const path = `${userId}/${order.id}/NF-${orderNumber}.pdf`;
    const { error: uploadError } = await db.storage.from('invoices').upload(path, blob, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadError && !String(uploadError.message || '').toLowerCase().includes('already exists')) throw uploadError;

    const { error: updateError } = await db.from('orders').update({
      customer_email: session.user.email || null,
      nf_storage_path: path,
      nf_file_name: `NF-${orderNumber}.pdf`,
      nf_status: 'Pendente',
      updated_at: new Date().toISOString(),
    }).eq('id', order.id).eq('customer_id', userId);
    if (updateError) throw updateError;
    return true;
  } catch (error) {
    console.error('Erro ao gerar/anexar NF:', error);
    showToast('Pedido criado. A NF será disponibilizada para revisão da equipe.', 'error');
    return false;
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
  if (buyerOrders.length) {
    const orderIds = buyerOrders.map(o => o.id);
    const { data: reviews } = await db.from('order_reviews').select('order_id,rating,comment,created_at').in('order_id', orderIds);
    const reviewMap = new Map((reviews || []).map(r => [r.order_id, r]));
    buyerOrders.forEach(order => { order.review = reviewMap.get(order.id) || null; });
  }

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
          <div class="buyer-order-total"><span>Total</span><strong>R$ ${money(order.total)}</strong>${order.coupon_code ? `<small class="buyer-order-coupon">Cupom ${escapeHtml(order.coupon_code)} · -${Number(order.discount_percent||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</small>` : ''}</div>
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
          ${order.status === 'Concluído' ? `
            <div class="buyer-review-area">
              ${order.review?.rating ? `
                <div class="review-submitted"><strong>Seu feedback</strong><span>${'★'.repeat(Number(order.review.rating))}${'☆'.repeat(5-Number(order.review.rating))}</span><small>${escapeHtml(order.review.comment || 'Obrigado pela avaliação!')}</small></div>
              ` : `<button class="review-order-btn" data-review-order="${order.id}">⭐ Avaliar compra</button>`}
            </div>
          ` : ''}
        `}
      </article>
    `;
  }).join('');
}

function openReviewModal(orderId) {
  const order = buyerOrders.find(o => String(o.id) === String(orderId));
  if (!order || order.status !== 'Concluído') return;
  const modal = document.querySelector('#reviewModal');
  const detail = document.querySelector('#reviewDetail');
  if (!modal || !detail) return;
  detail.innerHTML = `
    <p class="eyebrow">PEDIDO #${String(order.id).padStart(6,'0')}</p>
    <h2>Avalie sua compra</h2>
    <p class="review-intro">Seu pedido foi concluído. Conte como foi sua experiência.</p>
    <div class="review-stars" role="radiogroup" aria-label="Nota da compra">
      ${[1,2,3,4,5].map(n => `<button type="button" class="review-star" data-rating="${n}" aria-label="${n} estrela${n>1?'s':''}">★</button>`).join('')}
    </div>
    <textarea id="reviewComment" maxlength="1000" placeholder="Escreva seu feedback (opcional)..."></textarea>
    <button type="button" class="buy" id="submitReview">Enviar feedback</button>
  `;
  modal.classList.remove('hidden');
  let selected = 5;
  detail.querySelectorAll('.review-star').forEach(btn => {
    btn.classList.toggle('selected', Number(btn.dataset.rating) <= selected);
    btn.addEventListener('click', () => {
      selected = Number(btn.dataset.rating);
      detail.querySelectorAll('.review-star').forEach(star => star.classList.toggle('selected', Number(star.dataset.rating) <= selected));
    });
  });
  detail.querySelector('#submitReview').onclick = async () => {
    const comment = detail.querySelector('#reviewComment')?.value.trim() || '';
    const button = detail.querySelector('#submitReview');
    button.disabled = true;
    try {
      const { error } = await db.rpc('submit_order_review', {
        p_order_id: Number(orderId),
        p_rating: selected,
        p_comment: comment
      });
      if (error) throw error;
      modal.classList.add('hidden');
      await renderBuyerOrders();
      showToast('Obrigado pelo seu feedback!', 'success');
    } catch (error) {
      showToast(error.message || 'Não foi possível enviar seu feedback.', 'error');
      button.disabled = false;
    }
  };
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
      <div><span>Pagamento</span><strong>${escapeHtml(order.payment_method_name || order.payment_method || 'Não informado')}</strong></div>
    </div>
    <div class="receipt-divider"></div>
    <p class="receipt-section-title">ITENS DO PEDIDO</p>
    <div class="receipt-items">
      ${items.map(item => `<div class="receipt-item"><span>${item.quantity}x ${item.product_name}</span><strong>R$ ${money(item.subtotal)}</strong></div>`).join('')}
    </div>
    ${order.coupon_code ? `<div class="receipt-coupon"><span>Cupom ${escapeHtml(order.coupon_code)} (${Number(order.discount_percent||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}%)</span><strong>- R$ ${money(order.discount_amount)}</strong></div>` : ''}
    <div class="receipt-total"><span>Total</span><strong>R$ ${money(order.total)}</strong></div>
    <div class="pix-box"><div class="pix-title"><span class="pix-symbol">◆</span><strong>Pagamento ${escapeHtml(order.payment_method_name || order.payment_method || 'simulado')}</strong></div><p>Este pedido utiliza uma simulação de pagamento para fins demonstrativos do marketplace.</p><div class="pix-code">PAGAMENTO-SIMULADO-${orderNumber}</div></div>
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
  doc.text(`Pagamento: ${String(order.payment_method_name || order.payment_method || 'Não informado')} — Simulado`, 20, y); y += 15;
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
  const cancelButton = event.target.closest('[data-cancel-order]');
  if (cancelButton) return cancelBuyerOrder(cancelButton.dataset.cancelOrder);
  const reviewButton = event.target.closest('[data-review-order]');
  if (reviewButton) openReviewModal(reviewButton.dataset.reviewOrder);
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
