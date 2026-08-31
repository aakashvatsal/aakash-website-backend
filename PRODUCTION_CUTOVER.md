# Personal OS Production Cutover

This runbook is for the single-owner Aakash Personal OS production release.

## 1. Pre-deploy gates

Run locally in the backend repository:

```bash
npm ci
npm run prod:env:check
npm run lint:check
npm run build
```

Run locally in the frontend repository:

```bash
npm ci
npx tsc --noEmit
npm run lint
npm run build
```

Do not deploy while any of these commands fail.

## 2. Backend production environment

The EC2 application directory must contain a non-committed `.env`. Use `.env.example` as the configuration contract.

Core blocking values include MongoDB, owner authentication, admin session signing, frontend origins, and OpenAI credentials. The production validator never prints secret values.

Before release, also configure and verify:

- `PERSONAL_OS_BACKUP_STRATEGY`
- `PERSONAL_OS_BACKUP_LAST_VERIFIED_AT`
- explicit OpenAI + embedding models
- WHOOP credentials if WHOOP is expected to be live
- AI hard budget limits

## 3. GitHub Actions / EC2 prerequisites

The backend repository needs these GitHub Actions secrets:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`
- `EC2_APP_PATH`

EC2 must have:

- Node.js with `--env-file` support
- npm
- git
- PM2
- an existing PM2 application named `aakash-backend`
- HTTPS routing for `https://api.aakashvatsal.com`

## 4. Automated backend deployment

A push to `main` or manual workflow dispatch will:

1. capture the currently deployed Git SHA;
2. fetch and reset to the new `main` SHA;
3. run `npm ci`;
4. validate `.env` without exposing values;
5. run strict ESLint without modifying source files;
6. build NestJS;
7. expose `GIT_SHA` and `APP_VERSION` to PM2;
8. restart PM2;
9. verify local `/system/health` + `/system/readiness`;
10. verify the same readiness contract through `api.aakashvatsal.com`.

If any deployment-stage check fails, the workflow resets the EC2 checkout to the previous SHA, rebuilds it, restarts PM2, and leaves the failed workflow red for investigation.

## 5. Post-deploy owner checks

After the backend is healthy, sign in to the admin Personal OS and verify:

- `/admin/hsakaa/release-readiness`
- `/admin/hsakaa/operations`

Release Hardening should report no failures. Operations should identify the deployed release via `GIT_SHA` / `APP_VERSION`, show MongoDB ready, and show no hard AI budget breach.

Run the authenticated Operations RC smoke from the Operations page. Warnings may be reviewed deliberately; failures are release blockers.

## 6. Frontend cutover

The current production CORS configuration already includes the canonical site and the existing hosted frontend origin. Keep the frontend hosting project connected to the intended production branch and configure these server-side values in the hosting environment:

- `BACKEND_API_URL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

After the production build deploys, run:

```bash
FRONTEND_URL=https://aakashvatsal.com npm run test:smoke
```

The smoke suite checks the public pages, HSAKAA entry routes, search, and admin login for HTTP/application failures.

## 7. Final verification

Verify all of the following before declaring cutover complete:

- `https://api.aakashvatsal.com/api/v1/system/health` returns `status: ok`
- `https://api.aakashvatsal.com/api/v1/system/readiness` returns `status: ready`
- `https://aakashvatsal.com` loads over HTTPS
- admin login succeeds
- Release Readiness has zero blockers
- Operations RC smoke has zero failures
- backup verification timestamp is current
- WHOOP remains connected
- one HSAKAA read-only question succeeds
- one Universal Search query succeeds
- one Proactive scan can be invoked without duplicate/lease errors

## 8. Rollback

The backend workflow automatically rolls back runtime code if deployment health fails. For a later functional regression, redeploy the last known-good commit to `main` or manually reset the EC2 checkout to that SHA, run `npm ci && npm run build`, and restart `aakash-backend` with PM2.

Do not roll back MongoDB data by code deployment. Database restoration is a separate backup/restore operation and should only use a verified backup procedure.
