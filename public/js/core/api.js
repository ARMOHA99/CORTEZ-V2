/**
 * CORTEZ — طبقة الاتصال بالخادم
 * كل الطلبات تمر من هنا لضمان إرسال رمز CSRF ومعالجة الأخطاء بشكل موحّد.
 */

let csrfToken = '';

export function setCsrf(token) {
  csrfToken = String(token || '');
}

export function getCsrf() {
  return csrfToken;
}

function handleUnauthorized() {
  window.dispatchEvent(new CustomEvent('cortez:unauthorized'));
}

export async function api(path, options = {}) {
  const { method = 'GET', body, headers = {}, signal, raw = false } = options;
  const upper = method.toUpperCase();
  const requestHeaders = { Accept: 'application/json', ...headers };

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(upper) && csrfToken) {
    requestHeaders['x-csrf-token'] = csrfToken;
  }

  let response;
  try {
    response = await fetch(path, {
      method: upper,
      headers: requestHeaders,
      credentials: 'same-origin',
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw Object.assign(new Error('تعذّر الاتصال بالخادم. تحقق من الشبكة.'), { status: 0, code: 'NETWORK' });
  }

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else if (raw) {
    data = await response.blob();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    if (response.status === 401) handleUnauthorized();
    const error = new Error(
      (data && (data.error || data.message)) || `فشل الطلب (${response.status})`
    );
    error.status = response.status;
    error.code = (data && data.code) || 'ERROR';
    error.data = data;
    throw error;
  }

  return data;
}

export const get = (path, options) => api(path, { ...options, method: 'GET' });
export const post = (path, body, options) => api(path, { ...options, method: 'POST', body });
export const patch = (path, body, options) => api(path, { ...options, method: 'PATCH', body });
export const del = (path, options) => api(path, { ...options, method: 'DELETE' });

export async function upload(file) {
  const form = new FormData();
  form.append('image', file);
  return api('/api/upload', { method: 'POST', body: form });
}

export async function download(path, filename) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
  });
  if (!response.ok) {
    let message = 'تعذّر تنزيل الملف';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch (error) {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const name = filename || (match ? decodeURIComponent(match[1]) : 'cortez-export.csv');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
