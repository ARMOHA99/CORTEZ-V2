const config = require('../config');
const release = require('./release');

function publicConfig(req) {
  const base = config.publicConfig();
  return {
    ...base,
    release: release.version,
    csrfToken: req && req.session ? req.session.csrfToken || null : null,
    authenticated: Boolean(req && req.user),
    discordConfigured: Boolean(config.discord.clientId && config.discord.clientSecret),
    serverTime: new Date().toISOString(),
    year: new Date().getFullYear()
  };
}

module.exports = publicConfig;
