const express = require('express');
const multer = require('multer');
const config = require('../../config');
const { asyncHandler, httpError } = require('../utils/http');
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const uploader = require('../services/uploader');

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

function mongoReady() {
  return require('mongoose').connection.readyState === 1;
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
    const result = await uploader.saveImage(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ url: result.url, provider: result.provider, note: result.note });
  })
);

module.exports = router;
