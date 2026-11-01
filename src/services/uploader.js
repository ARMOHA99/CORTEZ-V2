/* حفظ الصور المرفوعة: Cloudinary إن كان مضبوطًا، ثم قاعدة البيانات، ثم القرص.
   مشترك بين رفع الإدارة (products/إعلانات) ورفع صور سوق الأعضاء. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');

const PLACEHOLDER_CLOUD_NAMES = ['root', 'cloud', 'default', 'demo', 'test', 'mycloud'];

function cloudNameLooksValid(name) {
  const value = String(name || '').trim();
  if (!value) return false;
  if (value !== value.toLowerCase()) return false;
  if (!/^[a-z][a-z0-9_-]{2,}$/.test(value)) return false;
  return !PLACEHOLDER_CLOUD_NAMES.includes(value);
}

function cloudinaryConfigured() {
  return Boolean(
    cloudNameLooksValid(config.cloudinary.cloudName) && config.cloudinary.apiKey && config.cloudinary.apiSecret
  );
}

function mongoReady() {
  return require('mongoose').connection.readyState === 1;
}

function localUpload(buffer, originalName) {
  const dir = path.join(__dirname, '..', '..', 'public', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(originalName || '').toLowerCase() || '.png';
  const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `/uploads/${name}`;
}

async function databaseUpload(buffer, mimetype, originalName) {
  const Upload = require('../models/Upload');
  const doc = await Upload.create({
    name: String(originalName || '').slice(0, 160),
    contentType: mimetype,
    size: buffer.length,
    data: buffer
  });
  return `/api/upload/file/${doc._id}`;
}

async function cloudinaryUpload(buffer, cloudNameOverride) {
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: cloudNameOverride || config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret
  });
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: config.cloudinary.folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/* يُرجع { url, provider, note } أو يرمي خطأً إن فشلت كل الطرق */
async function saveImage(buffer, mimetype, originalName) {
  let url = '';
  let provider = 'database';
  let note = '';

  if (cloudinaryConfigured()) {
    const attempts = [config.cloudinary.cloudName];
    const lower = String(config.cloudinary.cloudName).toLowerCase();
    if (lower !== config.cloudinary.cloudName) attempts.push(lower);
    let lastReason = '';
    for (const cloudName of attempts) {
      try {
        url = await cloudinaryUpload(buffer, cloudName);
        provider = 'cloudinary';
        break;
      } catch (error) {
        lastReason = String(
          (error && (error.message || (error.error && error.error.message))) || error || 'سبب غير معروف'
        ).slice(0, 180);
        console.error('[Upload] Cloudinary فشل:', lastReason);
      }
    }
    if (!url) note = 'حُفظت الصورة داخل الموقع.';
  }

  if (!url && mongoReady()) {
    try {
      url = await databaseUpload(buffer, mimetype, originalName);
      provider = 'database';
    } catch (error) {
      console.error('[Upload] قاعدة البيانات فشلت:', error.message);
    }
  }

  if (!url) {
    try {
      url = localUpload(buffer, originalName);
      provider = 'local';
      note = note || 'تم الحفظ على القرص المحلي فقط (قد تُفقد الصورة عند إعادة نشر Render).';
    } catch (error) {
      console.error('[Upload] القرص فشل:', error.message);
    }
  }

  if (!url) {
    const error = new Error('تعذّر حفظ الصورة، حاول مرة أخرى');
    error.status = 500;
    error.code = 'UPLOAD_FAILED';
    throw error;
  }

  return { url, provider, note };
}

module.exports = { saveImage, cloudNameLooksValid, cloudinaryConfigured, mongoReady, localUpload, databaseUpload };
