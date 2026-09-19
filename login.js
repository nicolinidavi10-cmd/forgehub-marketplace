const db = window.brenntagSupabase;
const form = document.querySelector('#loginForm');
const signupForm = document.querySelector('#signupForm');
const error = document.querySelector('#loginError');
const signupError = document.querySelector('#signupError');
const info = document.querySelector('#loginInfo');
const tabs = document.querySelectorAll('[data-auth-tab]');
const loginPanel = document.querySelector('#loginPanel');
const signupPanel = document.querySelector('#signupPanel');

function setMessage(el, text, type = 'error') {
  if (!el) return;
  el.textContent = text;
  el.className = type === 'success' ? 'message success' : 'error';
  el.style.display = 'block';
}

function clearMessages() {
  [error, signupError, info].forEach(el => {
    if (el) {
      el.textContent = '';
      el.style.display = 'none';
    }
  });
}

function showTab(tab) {
  clearMessages();
  const login = tab === 'login';
  loginPanel?.classList.toggle('active', login);
  signupPanel?.classList.toggle('active', !login);
  tabs.forEach(button => button.classList.toggle('active', button.dataset.authTab === tab));
}

tabs.forEach(button => {
  button.addEventListener('click', () => showTab(button.dataset.authTab));
});

async function getProfile(userId) {
  const { data, error: queryError } = await db
    .from('profiles')
    .select('id,full_name,role')
    .eq('id', userId)
    .maybeSingle();

  if (queryError) throw queryError;

  if (data) return data;

  const { data: created, error: createError } = await db
    .from('profiles')
    .insert({ id: userId, role: 'customer' })
    .select('id,full_name,role')
    .single();

  if (createError) throw createError;
  return created;
}

async function redirectByRole(user) {
  const profile = await getProfile(user.id);
  if (profile.role === 'admin') {
    window.location.href = 'admin.html';
  } else {
    window.location.href = 'index.html';
  }
}

if (!window.brenntagSupabaseConfigured || !db) {
  setMessage(error, 'Conecte primeiro o Supabase em supabase-config.js.');
  form?.querySelector('button')?.setAttribute('disabled', 'disabled');
  signupForm?.querySelector('button')?.setAttribute('disabled', 'disabled');
} else {
  db.auth.getSession().then(async ({ data }) => {
    if (!data.session) return;
    try {
      await redirectByRole(data.session.user);
    } catch {
      // Sessão existente, mas perfil ainda indisponível. Permite tentar novamente.
    }
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    clearMessages();

    const email = document.querySelector('#username').value.trim();
    const password = document.querySelector('#password').value;
    const button = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      setMessage(error, 'Preencha e-mail e senha para continuar.');
      return;
    }

    button.disabled = true;
    button.textContent = 'Entrando...';

    const { data, error: authError } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      setMessage(error, authError.message || 'E-mail ou senha incorretos.');
      button.disabled = false;
      button.innerHTML = 'Entrar <span>→</span>';
      return;
    }

    try {
      await redirectByRole(data.user);
    } catch (profileError) {
      setMessage(error, profileError.message || 'Não foi possível carregar seu perfil.');
      button.disabled = false;
      button.innerHTML = 'Entrar <span>→</span>';
    }
  });

  signupForm?.addEventListener('submit', async event => {
    event.preventDefault();
    clearMessages();

    const name = document.querySelector('#signupName').value.trim();
    const email = document.querySelector('#signupEmail').value.trim();
    const password = document.querySelector('#signupPassword').value;
    const button = signupForm.querySelector('button[type="submit"]');

    if (password.length < 6) {
      setMessage(signupError, 'Use uma senha com pelo menos 6 caracteres.');
      return;
    }

    button.disabled = true;
    button.textContent = 'Criando conta...';

    const { data, error: authError } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name
        }
      }
    });

    if (authError) {
      setMessage(signupError, authError.message || 'Não foi possível criar a conta.');
      button.disabled = false;
      button.innerHTML = 'Criar conta <span>→</span>';
      return;
    }

    if (data.session && data.user) {
      try {
        await db.from('profiles').upsert({
          id: data.user.id,
          full_name: name,
          role: 'customer'
        }, { onConflict: 'id' });
        await redirectByRole(data.user);
        return;
      } catch (profileError) {
        setMessage(signupError, profileError.message || 'Conta criada, mas o perfil não pôde ser finalizado.');
      }
    } else {
      setMessage(
        info,
        'Conta criada. Verifique seu e-mail para confirmar a conta e depois entre no BRENNTAG.',
        'success'
      );
      showTab('login');
    }

    button.disabled = false;
    button.innerHTML = 'Criar conta <span>→</span>';
  });
}
