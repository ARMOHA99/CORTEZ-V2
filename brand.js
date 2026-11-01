/**
 * CORTEZ — الهوية البصرية (الاسم + الشعار من الإعدادات)
 */
import { state } from './state.js';

function safeUrl(value) {
  const url = String(value || '').trim();
  return /^(https?:\/\/|\/)/i.test(url) ? url : '';
}

export function brandInfo() {
  const org = (state.config && state.config.org) || {};
  return { name: org.name || 'CORTEZ', logo: safeUrl(org.logoUrl) };
}

export function applyBrand(root = document) {
  const { name, logo } = brandInfo();

  root.querySelectorAll('.org-name').forEach((el) => {
    el.textContent = name;
    if (el.hasAttribute('data-text')) el.setAttribute('data-text', name);
  });

  root.querySelectorAll('.brand-sigil, .sigil-mark, .pact-mark').forEach((el) => {
    el.classList.toggle('has-logo', Boolean(logo));
    el.textContent = '';
    if (logo) {
      const img = document.createElement('img');
      img.className = 'brand-logo-img';
      img.alt = '';
      img.src = logo;
      el.appendChild(img);
    } else {
      el.textContent = String(name || 'C').trim().charAt(0).toUpperCase() || 'C';
    }
  });

  const icon = document.querySelector('link[rel="icon"]');
  if (icon && logo) icon.setAttribute('href', logo);
}
