/**
 * CORTEZ — حالة التطبيق المشتركة
 */

export const state = {
  config: null,
  user: null,
  rank: null,
  permissions: [],
  pact: null,
  duty: null,
  notifications: { items: [], unread: 0 },
  online: 0,
  release: '',
  route: '',
  authenticated: false,
  booted: false
};

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

export function off(event, handler) {
  const set = listeners.get(event);
  if (set) set.delete(handler);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) {
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[state] ${event}:`, error);
      }
    }
  }
  window.dispatchEvent(new CustomEvent(`cortez:${event}`, { detail: payload }));
}

export function can(permission) {
  if (!permission) return true;
  return state.permissions.includes(permission) || state.permissions.includes('system:admin');
}

export function canAny(...permissions) {
  return permissions.filter(Boolean).some((permission) => can(permission));
}

export function canAll(...permissions) {
  return permissions.filter(Boolean).every((permission) => can(permission));
}

export function applyMe(data) {
  state.authenticated = true;
  state.user = data.user || null;
  state.rank = data.rank || null;
  state.permissions = Array.isArray(data.permissions) ? data.permissions : [];
  state.pact = data.pact || state.pact;
  state.duty = data.duty || state.duty;
  if (data.notifications) state.notifications = data.notifications;
  if (data.online !== undefined) state.online = data.online;
  if (data.release) state.release = data.release;
  emit('me', data);
  return data;
}

export function patchUser(patch) {
  state.user = { ...(state.user || {}), ...(patch || {}) };
  emit('user', state.user);
}

export function setDuty(duty) {
  state.duty = duty || null;
  emit('duty', state.duty);
}

export function setNotifications(data) {
  state.notifications = {
    unread: Number(data && data.unread) || 0,
    items: Array.isArray(data && data.items) ? data.items : []
  };
  emit('notifications', state.notifications);
}

export function setOnline(count) {
  state.online = Math.max(0, Number(count) || 0);
  emit('online', state.online);
}

export function reset() {
  state.authenticated = false;
  state.user = null;
  state.rank = null;
  state.permissions = [];
  state.pact = null;
  state.duty = null;
  state.notifications = { items: [], unread: 0 };
  emit('reset');
}

export function currency() {
  return (state.config && state.config.system && state.config.system.currencyLabel) || 'دولار';
}

export function timezone() {
  return (state.config && state.config.system && state.config.system.timezone) || 'Asia/Riyadh';
}
