// Server session auth (email + password). Cookie is HttpOnly from /api/auth/*.
import { t } from './i18n.js';

let cached = undefined;

// API errors are English; show them in the reader's language.
const SERVER_ERRORS = {
  'Email or password incorrect': 'errBadLogin',
  'Email already registered': 'errEmailTaken',
  'Invalid email': 'errEmail',
  'Name required': 'errName',
  'Password must be at least 6 characters': 'errPassword',
  'Address already taken': 'slugTaken',
  'Address reserved': 'slugTaken',
  'Invalid address': 'errSlug',
  'Cat name required': 'errCatName',
  'Please log in first': 'needLogin',
};
const localError = (message, fallbackKey) => t(SERVER_ERRORS[message] ?? fallbackKey);

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
  if (!response.ok) throw new Error(localError(data.error, 'errSignup'));
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
  if (!response.ok) throw new Error(localError(data.error, 'errLogin'));
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
  if (!response.ok) throw new Error(localError(data.error, 'errCreate'));
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
        <button type="button" class="auth-close" aria-label="${t('close')}">×</button>
        <h2 data-title></h2>
        <p class="lead" data-lead></p>
        <form id="authForm" class="form">
          <label><span>${t('displayName')}</span><input name="name" maxlength="32" required /></label>
          <label><span>${t('email')}</span><input name="email" type="email" required /></label>
          <label><span>${t('password')}</span><input name="password" type="password" minlength="6" required /></label>
          <p class="error" data-error hidden></p>
          <button type="submit" class="button" data-submit></button>
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
      title.textContent = t(isLogin ? 'loginTitle' : 'signupTitle');
      lead.textContent = t(isLogin ? 'loginLead' : 'signupLead');
      nameField.hidden = isLogin;
      modal.querySelector('[name=name]').required = !isLogin;
      switchBtn.textContent = t(isLogin ? 'toSignup' : 'toLogin');
      modal.querySelector('[data-submit]').textContent = t(isLogin ? 'login' : 'signUp');
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
