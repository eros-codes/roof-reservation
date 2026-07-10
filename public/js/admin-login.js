import { api } from './api.js';

document.getElementById('login').onclick = async () => {
  const notice = document.getElementById('notice');
  const btn = document.getElementById('login');
  btn.disabled = true;
  try {
    await api('/api/admin/login', { method: 'POST', body: { email: document.getElementById('email').value, password: document.getElementById('password').value } });
    location.href = '/admin.html';
  } catch (error) {
    notice.className = 'notice danger';
    notice.textContent = error.message;
    btn.disabled = false;
  }
};
