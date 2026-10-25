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

async function cloudinaryUpload(buffer) {
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
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

router.post(
  '/',
  requireAuth,
  requireAnyPermission(['store:manage', 'settings:manage', 'announcements:manage']),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw httpError(400, 'لم يتم إرسال صورة', 'NO_FILE');
    let url = '';
    let provider = 'local';
    let note = '';
    if (cloudinaryConfigured) {
      try {
        url = await cloudinaryUpload(req.file.buffer);
        provider = 'cloudinary';
      } catch (error) {
        const reason = String((error && (error.message || (error.error && error.error.message))) || error || 'سبب غير معروف').slice(0, 180);
        console.error('[Upload] Cloudinary فشل:', reason);
        note = `فشل رفع Cloudinary (${reason}) — تم حفظ الصورة محلياً بدلاً منه. راجع CLOUDINARY_CLOUD_NAME والمفاتيح.`;
      }
    } else {
      note = 'Cloudinary غير مهيأ — تم الحفظ محلياً (قد يُفقد عند إعادة نشر Render).';
    }
    if (!url) {
      try {
        url = localUpload(req.file.buffer, req.file.originalname);
      } catch (error) {
        console.error('[Upload] الحفظ المحلي فشل:', error.message);
        throw httpError(500, 'تعذّر حفظ الصورة على السيرفر: ' + error.message, 'UPLOAD_FAILED');
      }
    }
    res.status(201).json({ ok: true, url, provider, note });
  })
);

module.exports = router;
