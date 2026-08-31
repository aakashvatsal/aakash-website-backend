const baseUrl = (
  process.env.BACKEND_URL ||
  'http://127.0.0.1:4000/api/v1'
).replace(/\/$/, '');

const checks = [
  {
    name: 'health',
    path: '/system/health',
  },
  {
    name: 'readiness',
    path: '/system/readiness',
  },
  {
    name: 'dashboard',
    path: '/dashboard',
  },
  {
    name: 'tasks summary',
    path: '/tasks/summary',
  },
  {
    name: 'brain dump summary',
    path: '/brain-dump/summary',
  },
  {
    name: 'reminders summary',
    path: '/reminders/summary',
  },
  {
    name: 'integrations overview',
    path: '/integrations/overview',
  },
];

let failed = false;

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      failed = true;
      const body = await response.text();
      console.error(
        `FAIL ${check.name}: ${response.status} ${body.slice(0, 500)}`,
      );
      continue;
    }

    console.log(
      `PASS ${check.name}: ${response.status}`,
    );
  } catch (error) {
    failed = true;

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const cause =
      error instanceof Error &&
      error.cause &&
      typeof error.cause === 'object'
        ? error.cause
        : null;

    const causeCode =
      cause &&
      'code' in cause
        ? String(cause.code)
        : '';

    const causeAddress =
      cause &&
      'address' in cause
        ? String(cause.address)
        : '';

    const causePort =
      cause &&
      'port' in cause
        ? String(cause.port)
        : '';

    const detail = [
      causeCode,
      causeAddress,
      causePort,
    ]
      .filter(Boolean)
      .join(' ');

    console.error(
      `FAIL ${check.name}: ${message}${detail ? ` (${detail})` : ''} -> ${url}`,
    );
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(
    'Backend smoke checks passed.',
  );
}
