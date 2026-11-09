(async () => {
process.env.NODE_ENV='development'; process.env.SESSION_SECRET='test-secret-xxxxxxxxxxxxxxxx'; process.env.BOT_ENABLED='false';
const { MongoMemoryServer } = require('mongodb-memory-server');
const mem = await MongoMemoryServer.create({ instance: { dbName: 'cortez' } });
process.env.MONGODB_URI = mem.getUri();
const mongoose = require('mongoose'); await mongoose.connect(process.env.MONGODB_URI);

// تعطيل حماية الجلسة داخل الاختبار فقط
const authPath = require.resolve('./src/middleware/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  requireAuth: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
  requireRankLevel: () => (req, res, next) => next(),
  isSelfOrPermission: () => (req, res, next) => next(),
  attachUser: (req, res, next) => next()
}};

const express = require('express');
const app = express(); app.use(express.json());
app.use((req, res, next) => { req.user = global.__USER; req.permissions = global.__PERMS || []; next(); });
app.use('/api', require('./src/routes'));

const User = require('./src/models/User');
const settings = require('./src/services/settings');
await settings.setMany({ 'pact.enabled': false, 'agent.enabled': false }, null).catch(()=>{});

const list = async (label, user, perms) => {
  global.__USER = user; global.__PERMS = perms;
  const server = app.listen(0);
  const port = server.address().port;
  const r = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
  const body = await r.text();
  console.log(`${label}: ${r.status} ${body.slice(0, 220)}`);
  server.close();
};

const fresh = await User.create({ discordId: '900', username: 'moumen', displayName: 'MOUMEN', rank: 'member', inGuild: true, bloodPact: { signed: true, signedAt: new Date() } });
await list('عضو جديد بلا صلاحيات', fresh, []);
await list('عضو جديد بصلاحيات أساسية', fresh, ['leaderboard:view']);

const boss = await User.create({ discordId: '901', username: 'boss', displayName: 'البوس', rank: 'owner', inGuild: true, bloodPact: { signed: true, signedAt: new Date() } });
await list('أونر', boss, ['system:admin']);
await mongoose.disconnect(); await mem.stop();
})().catch(e => { console.error('فشل:', e); process.exit(1); });
