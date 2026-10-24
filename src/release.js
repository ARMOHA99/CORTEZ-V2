const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

function walk(dir, files = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return files;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'uploads') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(js|json|css|html|md|yaml|yml)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function computeVersion() {
  if (process.env.RELEASE_VERSION) return process.env.RELEASE_VERSION;
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 12);
  const hash = crypto.createHash('sha1');
  const candidates = [
    path.join(ROOT, 'package.json'),
    path.join(ROOT, 'config.js'),
    path.join(ROOT, 'server.js'),
    path.join(ROOT, 'src'),
    path.join(ROOT, 'public')
  ];
  const files = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) walk(candidate, files);
    else files.push(candidate);
  }
  files.sort();
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      hash.update(`${path.relative(ROOT, file)}:${stat.size}:${stat.mtimeMs}`);
    } catch (error) {
      /* ignore */
    }
  }
  return hash.digest('hex').slice(0, 12);
}

const version = computeVersion();

module.exports = {
  version,
  builtAt: new Date().toISOString(),
  root: ROOT
};
