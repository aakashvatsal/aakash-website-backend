# HSAKAA × Slack — setup and safety

This implementation extends the **uploaded November 22, 2026** backend and frontend. Slack is a separate permission-limited assistant, **not** Aakash's private Personal OS agent. The updated integration supports multiple connected Slack workspaces with owner approval (see `HSAKAA_SLACK_MULTI_WORKSPACE.md`), read-only AI answers, admin-approved knowledge, channel mentions, allowlisted DMs, intent classification and a persisted retry queue. It does **not** autonomously edit external applications or create tickets, reminders or deployments.

> **New:** For distributing the app to other workspaces, start with `HSAKAA_SLACK_MULTI_WORKSPACE.md`. External installations are pending until owner-approved; the old single-workspace activation steps below are not sufficient.

## 1. Create the Slack app

Create a Slack app at https://api.slack.com/apps and configure:

- Bot token OAuth scopes: `app_mentions:read`, `chat:write`, `im:history`.
- Bot events: `app_mention` and `message.im`.
- Events Request URL: `https://YOUR_BACKEND_HOST/api/v1/integrations/slack/events`.
- OAuth Redirect URL: `https://YOUR_BACKEND_HOST/api/v1/integrations/slack/callback`.
- Add the bot to any channel where you want to handle @mentions (`/invite @HSAKAA`). There is deliberately no history-browsing permission.
- Enable Event Subscriptions after the backend is reachable over HTTPS. Slack verifies the request URL with a signed `url_verification` request.

The file `docs/hsakaa-slack-manifest.example.json` has example settings. Replace placeholder URLs before importing it in Slack.

## 2. Backend environment

Provide these values **in the backend environment**, not the frontend:

```dotenv
SLACK_CLIENT_ID=...              # Basic Information → App Credentials
SLACK_CLIENT_SECRET=...          # Basic Information → App Credentials
SLACK_SIGNING_SECRET=...         # Basic Information → App Credentials
SLACK_REDIRECT_URI=https://YOUR_BACKEND_HOST/api/v1/integrations/slack/callback
SLACK_TOKEN_ENCRYPTION_KEY=...   # 64 hex chars (openssl rand -hex 32)
# Optional: organization information intentionally approved for all authorized Slack users
# HSAKAA_SLACK_KNOWLEDGE=...
```

The current backend must also have working `MONGODB_URI`, `OPENAI_API_KEY`, `ADMIN_SESSION_SECRET`, and `FRONTEND_URL`. `ADMIN_SESSION_SECRET` must match the frontend owner session secret. Keep your encryption key stable: changing it makes existing stored tokens unreadable until reconnecting Slack.

Do not place any secrets in the Slack app manifest, git repository, frontend source or shipped archives.

## 3. Deploy both changes

Install existing dependencies and build the backend and frontend using their normal deployment workflows. There are **no new npm dependencies**. Keep Nest's `rawBody: true` option in `src/main.ts`. `ScheduleModule.forRoot()` must remain registered in `src/app.module.ts` to enable the durable queue worker.

The worker runs in the Nest process on a 2.5-second interval. Run one worker process for the first deployment to avoid competing message histories. MongoDB stores queued events, progress and retry state, so accepted jobs can resume after a process restart. For higher throughput / more replicas, add a dedicated distributed worker and thread-locking before scaling out.

The frontend's verified admin-session proxy permits only authenticated settings API requests, and only sends `x-owner-session` for the new Slack admin routes. Slack event ingestion and OAuth callback are never routed through that proxy.

## 4. Connect and enable

1. Log in to the HSAKAA admin interface and open **Settings & Integrations**.
2. Select **Connect workspace** and authorize HSAKAA in Slack.
3. After the callback, return to Settings, enter Slack **channel IDs** (`C...` or `G...`) and/or permitted DM user IDs (`U...` or `W...`).
4. Enable DMs only if desired. **Enable AI responses** and save.
5. Add any approved organizational knowledge in the same section. Do not add sensitive private-owner records.
6. In Slack, send `@HSAKAA How do I ...?` in an approved channel, or DM the bot from an approved member account.
7. View **Recent Slack queries** in Settings to see intent, underlying need, answer and status.

Connection is disabled by default, including after reauthorization. A channel can be enabled for all members of that channel, so only add channels where the audience may see the knowledge provided.

## 5. Core API routes

Backend routes all start with `/api/v1/integrations/slack`:

| Method | Endpoint | Access |
| --- | --- | --- |
| GET | `/connect` | Owner session |
| GET | `/callback` | Public OAuth state (one-time) |
| POST | `/events` | Slack HMAC signature + 5-minute timestamp |
| GET | `/status` | Owner session |
| PATCH | `/workspaces/:teamId` | Owner session |
| DELETE | `/workspaces/:teamId` | Owner session |
| GET | `/queries` | Owner session |
| GET | `/knowledge` | Owner session |
| POST | `/knowledge` | Owner session |
| DELETE | `/knowledge/:id` | Owner session |

Status endpoints never expose Slack credentials. Bot tokens are encrypted using AES-256-GCM before they are stored in MongoDB.

## 6. Resolution semantics

- `resolved`: AI gave an answer without a detected external action requirement. **Not an externally verified fix.**
- `needs_clarification`: AI classified a missing required detail and requested it.
- `partially_resolved`: additional external access/action is required; the bot provided advice but did not execute it.
- `failed`: the message could not be processed after retries or its access was revoked.

The agent does not get personal-owner tools or private memory, even for someone claiming to be Aakash. Intent records are diagnostics, not proof of a user's motives.

## 7. Testing

```bash
# backend
./node_modules/.bin/tsc --noEmit --project tsconfig.build.json
./node_modules/.bin/jest src/modules/integrations/slack/slack.service.spec.ts --runInBand

# frontend
./node_modules/.bin/tsc --noEmit
```

Before enabling in production, perform a real Slack OAuth and signed event test against the deployed HTTPS host; local compilation cannot validate external Slack configuration or workspace authorization.

## 8. Operational cautions

- High-volume queries are rate-limited at ingestion (12 accepted events per user/workspace per minute).
- Slack retries are deduplicated using `(teamId, eventId)` in MongoDB. Outbound posts also receive deterministic `client_msg_id`. A network failure after Slack accepts a post but before the backend records its message timestamp can still cause a duplicate in rare cases.
- Message bodies are saved for intent review and thread context. Define your workspace's data retention policy before onboarding external users.
- At initial rollout use a single Nest worker instance to preserve thread order. The MongoDB lease prevents lost in-progress jobs on restart, but it is not a full distributed per-thread lock.
- There is intentionally no automated Slack channel history indexing, external ticket creation or owner-private tool execution; these require separately permissioned connectors and explicit confirmations.
