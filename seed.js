#!/usr/bin/env node
/* تهيئة قاعدة البيانات — يمكن تشغيله أكثر من مرة بأمان */
require('dotenv').config();
const { connectDB, disconnectDB } = require('../src/db');
const { ensureSeed } = require('../src/bootstrap');

async function main() {
  await connectDB();
  const result = await ensureSeed();
  console.log('[Seed] النتيجة:', result);
  await disconnectDB();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('[Seed] فشل:', error);
  await disconnectDB().catch(() => null);
  process.exit(1);
});
