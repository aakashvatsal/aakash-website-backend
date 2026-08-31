const baseUrl = (process.env.BACKEND_URL || 'https://api.aakashvatsal.com/api/v1').replace(/\/$/, '');
const attempts = Math.max(1, Number(process.env.SMOKE_ATTEMPTS) || 8);
const retryDelayMs = Math.max(250, Number(process.env.SMOKE_RETRY_DELAY_MS) || 2500);

const checks = [
  {
    name: 'health',
    path: '/system/health',
    validate(payload) {
      return payload?.status === 'ok';
    },
  },
  {
    name: 'readiness',
    path: '/system/readiness',
    validate(payload) {
      return payload?.status === 'ready' && payload?.checks?.mongodb?.ready === true;
    },
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runCheck(check) {
  const url = `${baseUrl}${check.path}`;
  let lastFailure = 'unknown failure';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          Accept: 'application/json',
          'user-agent': 'aakash-production-smoke/1.0',
        },
      });

      const body = await response.text();
      let payload = null;
      try {
        payload = body ? JSON.parse(body) : null;
      } catch {
        lastFailure = `non-JSON response (${response.status})`;
      }

      if (response.ok && check.validate(payload)) {
        console.log(`PASS ${check.name}: ${response.status} on attempt ${attempt}`);
        return true;
      }

      lastFailure = `HTTP ${response.status}; response did not satisfy ${check.name} contract`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (attempt < attempts) await sleep(retryDelayMs);
  }

  console.error(`FAIL ${check.name}: ${lastFailure} -> ${url}`);
  return false;
}

const results = await Promise.all(checks.map(runCheck));
if (results.some((passed) => !passed)) process.exit(1);

console.log('Production smoke checks passed.');
