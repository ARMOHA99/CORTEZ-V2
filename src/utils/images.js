/* تحقق موحّد من روابط الصور: ملفات محفوظة على القرص، أو صور محفوظة في قاعدة
   البيانات (/api/upload/file/<id>)، أو روابط خارجية آمنة. */

const DB_IMAGE_PATTERN = /^\/api\/upload\/file\/[a-f0-9]{24}$/i;
const LOCAL_IMAGE_PATTERN = /^\/uploads\/[A-Za-z0-9._-]+$/;

function httpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeImageUrl(value) {
  let image = String(value || '').trim().replace(/\\/g, '/');
  if (!image) return '';
  /* بعض الواجهات تحفظ المسار النسبي بلا شرطة البداية */
  if (image.startsWith('api/')) image = '/' + image;
  return image;
}

function isAllowedImageUrl(image) {
  if (DB_IMAGE_PATTERN.test(image)) return true;
  if (image.startsWith('/uploads/')) return LOCAL_IMAGE_PATTERN.test(image);
  if (image.startsWith('https://') || image.startsWith('http://localhost')) {
    return !/[\s"'<>]/.test(image);
  }
  return false;
}

function validateImage(value, label = 'رابط الصورة غير صالح') {
  const image = normalizeImageUrl(value);
  if (!image) return '';
  if (isAllowedImageUrl(image)) return image.slice(0, 500);
  throw httpError(400, label, 'INVALID_IMAGE');
}

function validateGallery(list, label = 'رابط صورة غير صالح في المعرض', max = 6) {
  if (!Array.isArray(list)) return [];
  const clean = [];
  for (const raw of list.slice(0, max)) {
    const value = normalizeImageUrl(raw);
    if (!value) continue;
    if (!isAllowedImageUrl(value)) throw httpError(400, label, 'INVALID_IMAGE');
    clean.push(value.slice(0, 500));
  }
  return clean;
}

module.exports = { normalizeImageUrl, isAllowedImageUrl, validateImage, validateGallery, httpError };
