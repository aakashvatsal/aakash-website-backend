# HSAKAA × Slack: multi-workspace distribution and approval

This update builds on the November 22 HSAKAA Slack integration. It permits **many independently installed Slack workspaces** but authorizes **none automatically**. Do not use the old one-workspace setup guide without this document.

## 1. Install HSAKAA in other Slack workspaces

In the Slack app settings for the **existing HSAKAA app**, not a new app:

1. Confirm **OAuth & Permissions → Redirect URLs** includes:
   `https://api.aakashvatsal.com/api/v1/integrations/slack/callback`
2. Confirm **Event Subscriptions → Request URL** is:
   `https://api.aakashvatsal.com/api/v1/integrations/slack/events`
3. Confirm bot scopes: `app_mentions:read`, `chat:write`, `im:history`.
4. Confirm subscribed bot events: `app_mention`, `message.im`.
5. Under **Manage Distribution**, satisfy Slack's distribution checklist and activate distribution to other workspaces. An *unlisted* distribution link is sufficient; being listed on the public Slack Marketplace is optional and subject to separate review.
6. Share the public installation URL shown under **HSAKAA Admin → Settings → HSAKAA × Slack**, which is derived from the backend `SLACK_REDIRECT_URI`:
   `https://api.aakashvatsal.com/api/v1/integrations/slack/install`
7. A workspace administrator opens that link and authorizes the app in their own Slack workspace. The app completes its separate OAuth exchange and saves a different encrypted bot token for that workspace.
8. The installer is redirected to the public `/slack/installed` page, explaining access is pending. The app does **not** become usable merely by installing it.

The public install endpoint constructs an OAuth URL and a random, single-use state parameter, then redirects to Slack. Do not link directly to the callback URL or reuse an OAuth authorization code.

Slack documentation: https://docs.slack.dev/app-management/distribution/ and https://docs.slack.dev/authentication/installing-with-oauth/.

## 2. Owner approval and workspace-specific permissions

Only an authenticated HSAKAA owner can call the admin endpoints. For **each installed workspace**:

- `Pending` (default): never run AI or access knowledge; reply with the fixed denial message on mentions or DMs.
- `Approved`: eligible to use HSAKAA, but still disabled until configured and enabled by the owner.
- `Rejected`: disable AI and respond with the denial message on mentions or DMs.
- `Enabled`: must also be `Approved` and have an explicit allowed channel or explicitly allowed DM member.
- `Allowed channels`: only these channel IDs may mention HSAKAA. The bot must be invited into the channel for Slack to deliver messages and allow replies.
- `Allowed members`: only these Slack member IDs can use DMs. Check **Require approved members in channels** if every channel mention must also be from an explicitly allowlisted member.
- `Allow DMs`: determines whether allowlisted members can DM the bot.

**Exact denial message**:

> Sorry, HSAKAA is not accessible to your Slack account.

Denials are processed in the Slack response queue, not the AI pipeline. They do not save the original message body; denial replies are limited to one per workspace/user/minute to avoid bot spam. A workspace or person with no installed/usable bot token cannot be messaged by the app, and a bot that has not been invited to a channel may be unable to reply there.

Owner changes to approval/permissions take effect before a queued request is processed and are rechecked immediately before the response is sent. Disconnecting a workspace revokes backend authorization and clears its locally saved bot token. For Slack-side uninstall, use Slack's app management controls as well.

## 3. Workspace data separation

Each Slack installation is indexed by Slack's **`team_id`** and maintains its own:

- Encrypted bot token (`hsakaa_slack_workspaces`)
- Approval, user and channel allowlists (`hsakaa_slack_workspaces`)
- Queue, conversation thread, request metadata and denial history (`hsakaa_slack_queries`)
- Approved knowledge (`hsakaa_slack_knowledge`)

The owner must select a specific workspace before adding or reviewing its knowledge. The former server-wide `HSAKAA_SLACK_KNOWLEDGE` fallback is **no longer consumed** because it could leak information to other tenants. Re-add intentionally shareable content separately for each approved workspace.

For Slack Connect shared channels, sender-team metadata is checked when supplied; known cross-workspace senders are denied by default. If your environment relies heavily on Slack Connect, verify enterprise identity and shared-channel cases before granting broad channel access.

Previously connected workspaces that lack an `approvalStatus` field will be treated as **Pending** until explicitly approved. This intentionally fails closed on upgrade.

## 4. Updated backend endpoints

All routes are prefixed `/api/v1/integrations/slack`:

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/install` | Public | Begin cross-workspace OAuth with single-use state |
| GET | `/connect` | Owner | Begin owner's own installation OAuth |
| GET | `/callback` | Public | Complete OAuth for a single workspace |
| POST | `/events` | Slack HMAC only | Receive events and queue answers or denials |
| GET | `/status` | Owner | View all installations, approval states and public install URL |
| PATCH | `/workspaces/:teamId` | Owner | Approve/reject and set per-workspace access |
| DELETE | `/workspaces/:teamId` | Owner | Disable and disconnect installation |
| GET | `/knowledge?teamId=T...` | Owner | View approved content only for one installation |
| POST | `/knowledge` | Owner | Add content: `{ "teamId": "T...", "title": "...", "content": "..." }` |
| DELETE | `/knowledge/:id?teamId=T...` | Owner | Remove content scoped to the selected team |
| GET | `/queries` | Owner | Review query/denial records |

Slack event HMAC verification, idempotent event IDs, private-owner tool isolation and the original read-only AI scope remain in force.

## 5. Deploy and test

Use the same backend secrets as the original integration:

```dotenv
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
SLACK_REDIRECT_URI=https://api.aakashvatsal.com/api/v1/integrations/slack/callback
SLACK_TOKEN_ENCRYPTION_KEY=... # openssl rand -hex 32, preserve the value across deployments
FRONTEND_URL=https://aakashvatsal.com
```

Apply the backend **and** frontend changes together; restart the backend and redeploy the frontend. The Slack app manifest does not need any extra OAuth scopes for these changes. The existing public `events` endpoint must remain HTTPS reachable. Do not add a global `SLACK_BOT_TOKEN` to the backend: per-workspace tokens come from OAuth, are encrypted and saved in MongoDB.

Run:

```bash
# backend
./node_modules/.bin/tsc --noEmit --project tsconfig.build.json
./node_modules/.bin/jest src/modules/integrations/slack --runInBand

# frontend
./node_modules/.bin/tsc --noEmit
```

Manual acceptance tests:

1. Install the app into **Workspace A** and **Workspace B** from the public installation link.
2. Verify both appear in the owner's admin UI as **Pending**, with **Enable AI responses** unchecked.
3. Mention HSAKAA in a channel it has been invited to in Workspace B. It should return the exact denial message and never call AI.
4. Approve only Workspace A, add a permitted channel and member, enable it, and ask an ordinary query. HSAKAA should answer in Workspace A.
5. Ask the same question in Workspace B; it must still receive the denial message.
6. Check workspace knowledge entries cannot be read from another workspace.
7. Revoke Workspace A and confirm further messages are denied.
8. Validate DMs, channel user restrictions, reinstallations, bot uninstalls and Slack Connect shared channels.

**Important functional limitation:** This iteration handles queries, intent identification and permitted Slack replies. It does **not** execute arbitrary Slack operations such as modifying channels, editing other users' messages, creating tickets or accessing third-party workspaces. Those operations require additional, explicit per-workspace scopes, confirmation policies, and action executors before they can be safely enabled.
