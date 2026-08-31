const failures = [];
const warnings = [];

const value = (key) => (process.env[key] ?? '').trim();
const requireValue = (key) => {
  if (!value(key)) failures.push(`${key} is required.`);
};
const warnMissing = (key, reason) => {
  if (!value(key)) warnings.push(`${key} is not configured${reason ? ` (${reason})` : ''}.`);
};

if (value('NODE_ENV') !== 'production') {
  failures.push('NODE_ENV must be exactly "production".');
}

for (const key of [
  'MONGODB_URI',
  'JWT_SECRET',
  'PERSONAL_OS_EMAIL',
  'PERSONAL_OS_PASSWORD_HASH',
  'ADMIN_SESSION_SECRET',
  'FRONTEND_URL',
  'OPENAI_API_KEY',
]) {
  requireValue(key);
}

for (const key of ['JWT_SECRET', 'ADMIN_SESSION_SECRET']) {
  const secret = value(key);
  if (secret && secret.length < 32) {
    failures.push(`${key} must be at least 32 characters.`);
  }
}

const passwordHash = value('PERSONAL_OS_PASSWORD_HASH');
if (passwordHash && !/^\$2[aby]\$/.test(passwordHash)) {
  failures.push('PERSONAL_OS_PASSWORD_HASH must be a bcrypt hash.');
}

const ownerEmail = value('PERSONAL_OS_EMAIL');
if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
  failures.push('PERSONAL_OS_EMAIL must be a valid email address.');
}

const frontendOrigins = value('FRONTEND_URL')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

for (const origin of frontendOrigins) {
  try {
    const parsed = new URL(origin);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      failures.push(`FRONTEND_URL contains an unsupported origin protocol: ${parsed.protocol}`);
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      failures.push(`FRONTEND_URL entries must be origins only: ${origin}`);
    }
  } catch {
    failures.push(`FRONTEND_URL contains an invalid URL: ${origin}`);
  }
}

if (frontendOrigins.some((origin) => origin.startsWith('http://localhost'))) {
  warnings.push('FRONTEND_URL still contains a localhost origin in production.');
}

const port = value('PORT');
if (port && (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)) {
  failures.push('PORT must be an integer between 1 and 65535.');
}

for (const [key, reason] of [
  ['OPENAI_MODEL', 'explicit production model selection is recommended'],
  ['OPENAI_EMBEDDING_MODEL', 'explicit embedding model selection is recommended'],
  ['WHOOP_CLIENT_ID', 'WHOOP integration will not be available'],
  ['WHOOP_CLIENT_SECRET', 'WHOOP integration will not be available'],
  ['WHOOP_REDIRECT_URI', 'WHOOP integration will not be available'],
  ['PERSONAL_OS_BACKUP_STRATEGY', 'Operations will report backup readiness as incomplete'],
  ['PERSONAL_OS_BACKUP_LAST_VERIFIED_AT', 'Operations cannot verify backup recency'],
  ['HSAKAA_AI_HARD_DAILY_TOKENS', 'no hard daily token ceiling is configured'],
]) {
  warnMissing(key, reason);
}

const redirectUri = value('WHOOP_REDIRECT_URI');
if (redirectUri) {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'https:') warnings.push('WHOOP_REDIRECT_URI should use HTTPS in production.');
  } catch {
    failures.push('WHOOP_REDIRECT_URI is not a valid URL.');
  }
}

console.log('Production environment validation');
console.log(`Required checks: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);

for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const failure of failures) console.error(`FAIL ${failure}`);

if (failures.length > 0) {
  console.error(`Production environment validation failed with ${failures.length} blocking issue(s).`);
  process.exit(1);
}

console.log(`Production environment validation passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
