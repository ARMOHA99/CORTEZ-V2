const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../../config');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requireAnyPermission } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.system.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
      return callback(httpError(400, 'يُسمح بالصور فقط (png, jpg, webp, gif)', 'INVALID_FILE'));
    }
    return callback(null, true);
  }
});

const cloudinaryConfigured = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret
);

function localUpload(buffer, originalName) {
  const dir = path.join(__dirname, '..', '..', 'public', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(originalName || '').toLowerCase() || '.png';
  const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `/uploads/${name}`;
}

function mongoReady() {
  return require('mongoose').connection.readyState === 1;
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

router.get(
  '/file/:id',
  asyncHandler(async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) throw httpError(404, 'غير موجود', 'NOT_FOUND');
    if (!mongoReady()) throw httpError(503, 'قاعدة البيانات غير متصلة', 'DB_OFFLINE');
    const Upload = require('../models/Upload');
    const doc = await Upload.findById(req.params.id).lean();
    if (!doc) throw httpError(404, 'الصورة غير موجودة', 'NOT_FOUND');
    res.set('Content-Type', doc.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(doc.data.buffer ? Buffer.from(doc.data.buffer) : doc.data);
  })
);

router.post(
  '/',
  requireAuth,
  requireAnyPermission(['store:manage', 'settings:manage', 'announcements:manage']),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw httpError(400, 'لم يتم إرسال صورة', 'NO_FILE');
    let url = '';
    let provider = 'database';
    let note = '';
    if (cloudinaryConfigured) {
      const attempts = [config.cloudinary.cloudName];
      const lower = String(config.cloudinary.cloudName).toLowerCase();
      if (lower !== config.cloudinary.cloudName) attempts.push(lower);
      let lastReason = '';
      for (const cloudName of attempts) {
        try {
          url = await cloudinaryUpload(req.file.buffer, cloudName);
          provider = 'cloudinary';
          break;
        } catch (error) {
          lastReason = String((error && (error.message || (error.error && error.error.message))) || error || 'سبب غير معروف').slice(0, 180);
          console.error('[Upload] Cloudinary فشل:', lastReason);
        }
      }
      if (!url) note = `تعذّر الرفع إلى Cloudinary (${lastReason}) فحُفظت الصورة في قاعدة البيانات بدلاً منه، وهي دائمة.`;
    }
    if (!url && mongoReady()) {
      try {
        url = await databaseUpload(req.file.buffer, req.file.mimetype, req.file.originalname);
        provider = 'database';
      } catch (error) {
        console.error('[Upload] قاعدة البيانات فشلت:', error.message);
      }
    }
    if (!url) {
      try {
        url = localUpload(req.file.buffer, req.file.originalname);
        provider = 'local';
        note = note || 'تم الحفظ على القرص المحلي فقط (قد تُفقد الصورة عند إعادة نشر Render).';
      } catch (error) {
        console.error('[Upload] الحفظ المحلي فشل:', error.message);
        throw httpError(500, 'تعذّر حفظ الصورة على السيرفر: ' + error.message, 'UPLOAD_FAILED');
      }
    }
    res.status(201).json({ ok: true, url, provider, note });
  })
);

module.exports = router;
