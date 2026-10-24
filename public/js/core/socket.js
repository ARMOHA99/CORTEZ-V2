/**
 * CORTEZ — عميل Socket.io مع التحقق من الإصدار
 */
import { state, emit, setOnline } from './state.js';
import { toast } from './ui.js';
import * as sound from './sound.js';

let socket = null;
let connected = false;
let releaseChecked = false;

export function getSocket() {
  return socket;
}

export function isConnected() {
  return connected;
}

function handleRelease(release) {
  if (!release) return;
  const current = state.release || document.querySelector('meta[name="release"]')?.content || '';
  if (current && current !== '__RELEASE__' && current !== release) {
    if (releaseChecked) return;
    releaseChecked = true;
    try {
      if (sessionStorage.getItem('cortez.reloaded') === release) return;
      sessionStorage.setItem('cortez.reloaded', release);
    } catch (error) {
      /* ignore */
    }
    toast('تم تحديث المنصة، جاري إعادة التحميل...', 'info', 'تحديث');
    setTimeout(() => {
      window.location.reload();
    }, 900);
  }
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

  socket.on('disconnect', () => {
    connected = false;
    emit('socket:disconnected');
  });

  socket.on('connect_error', (error) => {
    console.warn('[Socket] connect_error:', error.message);
  });

  socket.on('app:hello', (payload = {}) => {
    if (payload.release) {
      state.release = payload.release;
      handleRelease(payload.release);
    }
    if (typeof payload.online === 'number') setOnline(payload.online);
  });

  socket.on('app:release', (payload = {}) => {
    if (payload.release) handleRelease(payload.release);
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
