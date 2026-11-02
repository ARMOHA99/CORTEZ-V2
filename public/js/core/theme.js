/**
 * CORTEZ — الوضع الفاتح/الداكن
 * يُطبَّق قبل رسم الصفحة لتجنّب الوميض، ويُحفظ الاختيار محليًا.
 */
import { icon } from './icons.js';

const KEY = 'cortez.theme';

export function currentTheme() {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', value);
  try {
    localStorage.setItem(KEY, value);
  } catch (error) {
    /* ignore */
  }
  paintToggles();
  return value;
}

export function toggleTheme() {
  return applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

export function paintToggles() {
  const theme = currentTheme();
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.innerHTML = icon(theme === 'light' ? 'moon' : 'sun', 17);
    btn.setAttribute('aria-label', theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح');
    btn.setAttribute('title', theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح');
  });
}

export function initTheme() {
  let saved = '';
  try {
    saved = localStorage.getItem(KEY) || '';
  } catch (error) {
    saved = '';
  }
  document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark');
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      toggleTheme();
    });
  });
  paintToggles();
}
