// Server session auth (email + password). Cookie is HttpOnly from /api/auth/*.
let cached = undefined;

export async function fetchMe() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await response.json();
    cached = data.user ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

export function meCached() {
  return cached;
}

export async function register({ email, password, name }) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sign up failed');
  cached = data.user;
  return data.user;
}

export async function login({ email, password }) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Log in failed');
  cached = data.user;
  return data.user;
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  cached = null;
}

export async function checkSlug(slug) {
  const response = await fetch(`/api/cats/check?slug=${encodeURIComponent(slug)}`, { credentials: 'include' });
  return response.json();
}

export async function createCat(payload) {
  const response = await fetch('/api/cats', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not create cat');
  return data.cat;
}

export async function listCats() {
  const response = await fetch('/api/cats', { credentials: 'include' });
  if (!response.ok) return [];
  const data = await response.json();
  return data.cats || [];
}

export async function getCat(slug) {
  const response = await fetch(`/api/cats/get?slug=${encodeURIComponent(slug)}`, { credentials: 'include' });
  if (!response.ok) return null;
  const data = await response.json();
  return data.cat || null;
}

export function openAuthModal({ mode = 'login' } = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById('authModal');
    existing?.remove();
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'auth-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="auth-card">
        <button type="button" class="auth-close" aria-label="Close">×</button>
        <h2 data-title></h2>
        <p class="lead" data-lead></p>
        <form id="authForm" class="form">
          <label><span data-label-name>Your name</span><input name="name" maxlength="32" required /></label>
          <label><span data-label-email>Email</span><input name="email" type="email" required /></label>
          <label><span data-label-password>Password</span><input name="password" type="password" minlength="6" required /></label>
          <p class="error" data-error hidden></p>
          <button type="submit" class="button" data-submit>Continue</button>
        </form>
        <p class="hint"><button type="button" class="linkish" data-switch></button></p>
      </div>`;
    document.body.append(modal);

    let current = mode;
    const title = modal.querySelector('[data-title]');
    const lead = modal.querySelector('[data-lead]');
    const switchBtn = modal.querySelector('[data-switch]');
    const error = modal.querySelector('[data-error]');
    const nameField = modal.querySelector('[name=name]').closest('label');

    const paint = () => {
      const isLogin = current === 'login';
      title.textContent = isLogin ? 'Log in to Cat Planet' : 'Create your Cat Planet account';
      lead.textContent = isLogin
        ? 'So we know which cats are yours.'
        : 'One account — every cat you send is linked to you.';
      nameField.hidden = isLogin;
      modal.querySelector('[name=name]').required = !isLogin;
      switchBtn.textContent = isLogin ? 'Need an account? Sign up' : 'Already have an account? Log in';
      modal.querySelector('[data-submit]').textContent = isLogin ? 'Log in' : 'Sign up';
      error.hidden = true;
    };
    paint();

    const previouslyFocused = document.activeElement;
    const close = (user = null) => {
      modal.remove();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
      resolve(user);
    };
    modal.querySelector('.auth-close').onclick = () => close(null);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close(null);
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close(null);
    });
    queueMicrotask(() => modal.querySelector(current === 'login' ? '[name=email]' : '[name=name]')?.focus());
    switchBtn.onclick = () => {
      current = current === 'login' ? 'register' : 'login';
      paint();
    };
    modal.querySelector('#authForm').onsubmit = async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target).entries());
      error.hidden = true;
      try {
        const user = current === 'login'
          ? await login({ email: data.email, password: data.password })
          : await register({ email: data.email, password: data.password, name: data.name });
        close(user);
        location.reload();
      } catch (err) {
        error.hidden = false;
        error.textContent = err.message;
      }
    };
  });
}
