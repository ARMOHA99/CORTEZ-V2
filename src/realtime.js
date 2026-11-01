const crypto = require('crypto');
const config = require('../config');

let io = null;
let sessionMiddleware = null;
let releaseVersion = '1.0.0';
const presence = new Map();
let presenceTimer = null;

function userRoom(userId) {
  return `user:${userId}`;
}

function permissionRoom(permission) {
  return `perm:${permission}`;
}

function safeEmit(room, event, payload) {
  if (!io) return;
  try {
    io.to(room).emit(event, payload);
  } catch (error) {
    console.error('[Socket] emit error:', error.message);
  }
}

function emit(event, payload, room = 'members') {
  safeEmit(room, event, payload);
}

function emitPublic(event, payload) {
  safeEmit('public', event, payload);
}

function emitToUser(userId, event, payload) {
  if (!userId) return;
  safeEmit(userRoom(String(userId)), event, payload);
}

function emitToPermission(permission, event, payload) {
  if (!permission) return;
  safeEmit(permissionRoom(permission), event, payload);
  safeEmit('members', event, payload);
}

function emitToAll(event, payload) {
  safeEmit('public', event, payload);
}

function snapshotPresence() {
  const users = [];
  for (const [userId, entry] of presence.entries()) {
    users.push({
      userId,
      name: entry.name,
      rank: entry.rank,
      avatar: entry.avatar,
      since: entry.since,
      connections: entry.sockets.size
    });
  }
  return {
    online: users.length,
    connections: users.reduce((sum, entry) => sum + entry.connections, 0),
    users: users.sort((a, b) => (a.name > b.name ? 1 : -1))
  };
}

function schedulePresence() {
  if (presenceTimer) return;
  presenceTimer = setTimeout(() => {
    presenceTimer = null;
    const data = snapshotPresence();
    emitPublic('presence:update', { online: data.online });
    if (io) io.to('members').emit('presence:update', data);
  }, 600);
}

async function init(server, sessionMw, options = {}) {
  const { Server } = require('socket.io');
  sessionMiddleware = sessionMw;
  releaseVersion = options.release || crypto.randomBytes(4).toString('hex');

  io = new Server(server, {
    cors: {
      origin: config.security.allowedOrigins.length ? config.security.allowedOrigins : true,
      credentials: true
    },
    serveClient: true,
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, (error) => {
      if (error) return next(new Error('session_error'));
      return next();
    });
  });

  io.use(async (socket, next) => {
    try {
      const session = socket.request.session;
      socket.data.user = null;
      if (session && session.userId) {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return next();
        const User = require('./models/User');
        const { getRank } = require('./services/ranks');
        const user = await User.findById(session.userId).lean();
        if (user && !user.blocked && !user.sessionInvalid && user.inGuild) {
          const rank = await getRank(user.rank);
          socket.data.user = user;
          socket.data.rank = rank;
          socket.data.permissions = rank ? rank.permissions : [];
        }
      }
      return next();
    } catch (error) {
      console.error('[Socket] auth middleware:', error.message);
      return next();
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join('public');
    socket.emit('app:hello', {
      release: releaseVersion,
      online: snapshotPresence().online,
      authenticated: Boolean(user)
    });

    if (user) {
      socket.join('members');
      socket.join(userRoom(user._id));
      for (const permission of socket.data.permissions || []) {
        socket.join(permissionRoom(permission));
      }

      const key = String(user._id);
      const entry = presence.get(key) || {
        name: user.displayName || user.globalName || user.username || 'عضو',
        rank: user.rank,
        avatar: user.avatar || '',
        since: new Date().toISOString(),
        sockets: new Set()
      };
      entry.sockets.add(socket.id);
      entry.name = user.displayName || user.globalName || user.username || 'عضو';
      entry.rank = user.rank;
      presence.set(key, entry);
      schedulePresence();
      io.to('members').emit('presence:joined', { userId: key, name: entry.name, rank: entry.rank });
    }

    socket.on('presence:ping', () => {
      socket.emit('presence:pong', { at: Date.now() });
    });

    socket.on('duty:heartbeat', () => {
      if (user) socket.emit('duty:heartbeat:ack', { at: Date.now() });
    });

    socket.on('disconnect', () => {
      if (!user) return;
      const key = String(user._id);
      const entry = presence.get(key);
      if (entry) {
        entry.sockets.delete(socket.id);
        if (entry.sockets.size === 0) {
          presence.delete(key);
          io.to('members').emit('presence:left', { userId: key });
        }
      }
      schedulePresence();
    });
  });

  console.log(`[Socket] محرك التزامن اللحظي جاهز — الإصدار ${releaseVersion}`);
  return io;
}

function getIO() {
  return io;
}

function setRelease(version) {
  releaseVersion = version;
}

function broadcastRelease(version = releaseVersion) {
  releaseVersion = version;
  if (io) io.emit('app:release', { release: version, at: Date.now() });
}

function refreshUserSockets(userId) {
  if (!io) return;
  const key = String(userId);
  const sockets = io.sockets.sockets;
  for (const socket of sockets.values()) {
    if (socket.data && socket.data.user && String(socket.data.user._id) === key) {
      try {
        socket.disconnect(true);
      } catch (error) {
        /* ignore */
      }
    }
  }
}

function onlineCount() {
  return presence.size;
}

module.exports = {
  init,
  getIO,
  emit,
  emitPublic,
  emitToUser,
  emitToPermission,
  emitToAll,
  snapshotPresence,
  setRelease,
  broadcastRelease,
  refreshUserSockets,
  onlineCount,
  userRoom,
  permissionRoom
};
