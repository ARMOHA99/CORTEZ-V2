/**
 * CORTEZ — عميل Socket.io مع التحقق من الإصدار
 */
import { state, emit, setOnline } from './state.js';
import { toast } from './ui.js';
import * as sound from './sound.js';

let socket = null;
let connected = false;

/* الإصدار الذي حُمّلت به هذه الصفحة — ثابت لا يتغير أبدًا داخل الجلسة.
   المقارنة يجب أن تكون معه، لا مع state.release الذي يُحدَّث من الخادم. */
const bootRelease = (() => {
  const meta = document.querySelector('meta[name="release"]');
  const value = String((meta && meta.content) || '').trim();
  return value && value !== '__RELEASE__' ? value : '';
})();

let refreshing = false;

export function getSocket() {
  return socket;
}

export function isConnected() {
  return connected;
}

export function getBootRelease() {
  return bootRelease;
}

/* إعادة تحميل قسرية مع كسر الكاش، حتى لا تعود الصفحة القديمة من المتصفح */
function forceRefresh(release) {
  if (refreshing) return;
  refreshing = true;
  try {
    sessionStorage.setItem('cortez.reloaded', release);
  } catch (error) {
    /* ignore */
  }
  toast('صدر تحديث جديد للمنصة، جاري إعادة التحميل…', 'info', 'تحديث');
  setTimeout(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('_v', release);
      window.location.replace(url.toString());
    } catch (error) {
      window.location.reload();
    }
  }, 800);
}

function handleRelease(release) {
  const next = String(release || '').trim();
  if (!next || !bootRelease || next === bootRelease) return;
  try {
    if (sessionStorage.getItem('cortez.reloaded') === next) return;
  } catch (error) {
    /* ignore */
  }
  /* لا نقطع الكتابة على العضو: ننتظر خروجه من الحقل (بحد أقصى دقيقة) */
  const active = document.activeElement;
  const typing = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
  if (typing) {
    toast('تحديث جديد جاهز، سيُطبَّق بعد انتهاء كتابتك', 'warning', 'تحديث');
    const timer = setTimeout(() => forceRefresh(next), 60000);
    active.addEventListener(
      'blur',
      () => {
        clearTimeout(timer);
        setTimeout(() => forceRefresh(next), 700);
      },
      { once: true }
    );
    return;
  }
  forceRefresh(next);
}

/* مراقبة الإصدار: تعمل حتى لو تعذّر الاتصال بـ Socket.io */
export function watchRelease() {
  if (!bootRelease) return () => {};
  let stopped = false;

  const check = async () => {
    if (stopped || refreshing) return;
    try {
      const response = await fetch('/api/public/version', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.release) handleRelease(data.release);
    } catch (error) {
      /* الشبكة متعثرة: نعيد المحاولة في الدورة التالية */
    }
  };

  const first = setTimeout(check, 6000);
  const timer = setInterval(check, 60000);
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', check);
  window.addEventListener('online', check);

  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', check);
    window.removeEventListener('online', check);
  };
}

export function initSocket() {
  if (socket) return socket;
  if (typeof io === 'undefined') {
    console.warn('[Socket] io غير متوفر');
    return null;
  }
  try {
    socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
  } catch (error) {
    console.error('[Socket] init error:', error);
    return null;
  }

  socket.on('connect', () => {
    connected = true;
    emit('socket:connected');
  });

  // سُحبت صلاحية دخولك (سحب الرول في ديسكورد) → خروج فوري من الموقع
  socket.on('auth:revoked', (payload) => {
    toast((payload && payload.reason) || 'تم سحب صلاحية دخولك إلى الموقع', 'danger', 'انتهت الجلسة');
    setTimeout(() => { window.location.href = '/'; }, 1600);
  });

  // تغيّرت رتبتك في ديسكورد → تحديث الصلاحيات فورًا
  socket.on('auth:refresh', (payload) => {
    if (!payload || payload.reason !== 'rank-changed') return;
    toast('تم تحديث رتبتك وصلاحياتك من ديسكورد…', 'info', 'تحديث الرتبة');
    setTimeout(() => { window.location.reload(); }, 1300);
  });

  socket.on('disconnect', () => {
    connected = false;
    emit('socket:disconnected');
  });

  socket.on('connect_error', (error) => {
    console.warn('[Socket] connect_error:', error.message);
  });

  socket.on('app:hello', (payload = {}) => {
    if (payload.release) {
      handleRelease(payload.release);
      state.release = payload.release;
    }
    if (typeof payload.online === 'number') setOnline(payload.online);
  });

  socket.on('app:release', (payload = {}) => {
    if (payload.release) {
      handleRelease(payload.release);
      state.release = payload.release;
    }
  });

  /* بعد انقطاع ثم عودة الاتصال: نتأكد أننا على نفس إصدار الخادم */
  socket.on('reconnect', () => {
    fetch('/api/public/version', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data && data.release) handleRelease(data.release); })
      .catch(() => null);
  });

  socket.on('presence:update', (payload = {}) => {
    if (typeof payload.online === 'number') setOnline(payload.online);
    emit('presence', payload);
  });

  socket.on('presence:joined', (payload) => {
    emit('presence:joined', payload);
  });

  socket.on('presence:left', (payload) => {
    emit('presence:left', payload);
  });

  // Realtime events
  socket.on('dashboard:refresh', (payload) => emit('refresh:dashboard', payload));
  socket.on('duty:update', (payload) => emit('duty:live', payload));
  socket.on('duty:penalty', (payload) => { sound.notify(); emit('duty:penalty', payload); });
  socket.on('operations:update', (payload) => emit('refresh:operations', payload));
  socket.on('treasury:update', (payload) => emit('refresh:treasury', payload));
  socket.on('orders:update', (payload) => { if (state.authenticated) sound.notify(); emit('refresh:orders', payload); });
  socket.on('order:update', (payload) => { sound.notify(); toast('تم تحديث حالة طلبك', 'success'); emit('order:user', payload); });
  socket.on('store:update', (payload) => emit('refresh:store', payload));
  socket.on('votes:update', (payload) => { if (payload && payload.action === 'created') sound.notify(); emit('refresh:votes', payload); });
  socket.on('vote:accepted', (payload) => { sound.success(); emit('vote:accepted', payload); });
  socket.on('pacts:update', (payload) => emit('refresh:pacts', payload));
  socket.on('pact:signed', (payload) => { sound.success(); emit('pact:user-signed', payload); });
  socket.on('goal:update', (payload) => emit('goal:update', payload));
  socket.on('leaderboard:refresh', (payload) => emit('refresh:leaderboard', payload));
  socket.on('settings:update', (payload) => emit('refresh:settings', payload));
  socket.on('notifications:new', (payload) => { sound.notify(); emit('notifications:new', payload); });

  return socket;
}

export function emitEvent(event, payload) {
  if (socket && connected) socket.emit(event, payload);
}
