function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function httpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireFields(body, fields) {
  const missing = [];
  for (const field of fields) {
    const value = body ? body[field] : undefined;
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      missing.push(field);
    }
  }
  if (missing.length) {
    throw httpError(400, `الحقول التالية مطلوبة: ${missing.join(', ')}`, 'MISSING_FIELDS');
  }
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function paginate(query) {
  const page = Math.max(1, toInt(query.page, 1));
  const limit = Math.min(100, Math.max(1, toInt(query.limit, 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function cleanString(value, max = 500) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function csvEscape(value) {
  const text = String(value === undefined || value === null ? '' : value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows, headers) {
  const headerLine = headers.map((header) => csvEscape(header.label)).join(',');
  const lines = rows.map((row) =>
    headers.map((header) => csvEscape(typeof header.value === 'function' ? header.value(row) : row[header.value])).join(',')
  );
  return `\uFEFF${[headerLine, ...lines].join('\r\n')}`;
}

function jsonErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || error.statusCode || 500;
  let publicMessage = null;
  if (error && error.name === 'MulterError') {
    status = 400;
    publicMessage =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'حجم الصورة أكبر من الحد المسموح. صغّر الصورة أو اختر صورة أخف.'
        : 'تعذّر رفع الملف: ' + error.message;
  }
  if (status >= 500) {
    console.error('[Server]', error.stack || error.message);
  }
  const isApi = req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/auth');
  if (isApi) {
    const exposeMessage = status < 500 || error.code === 'UPLOAD_FAILED';
    return res.status(status).json({
      error: publicMessage || (exposeMessage ? error.message : 'حدث خطأ داخلي في الخادم'),
      code: error.code || 'ERROR'
    });
  }
  return res.status(status).send('حدث خطأ غير متوقع');
}

module.exports = {
  asyncHandler,
  httpError,
  requireFields,
  toInt,
  paginate,
  cleanString,
  escapeRegex,
  csvEscape,
  toCsv,
  jsonErrorHandler
};
