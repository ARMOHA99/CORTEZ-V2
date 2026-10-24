#!/usr/bin/env node
/* تشغيل محلي كامل بقاعدة بيانات MongoDB مؤقتة في الذاكرة (للتجربة فقط) */
require('dotenv').config();

async function main() {
  let MongoDBMemoryServer;
  try {
    ({ MongoMemoryServer } = require('mongodb-memory-server'));
  } catch (error) {
    console.error('mongodb-memory-server غير مثبت. شغّل: npm install');
    process.exit(1);
  }

  console.log('[DevMem] تشغيل MongoDB مؤقتة في الذاكرة...');
  const memoryServer = await MongoMemoryServer.create({
    instance: { dbName: 'cortez' }
  });
  const uri = memoryServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.DEV_LOGIN = process.env.DEV_LOGIN || 'true';
  process.env.DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
  process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
  process.env.DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'dev-memory-secret';
  process.env.PORT = process.env.PORT || '3000';

  console.log(`[DevMem] قاعدة البيانات جاهزة: ${uri}`);
  console.log('[DevMem] تسجيل الدخول التجريبي متاح من صفحة الدخول.');

  require('../server');

  const stop = async () => {
    await memoryServer.stop().catch(() => null);
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((error) => {
  console.error('[DevMem] فشل:', error);
  process.exit(1);
});
