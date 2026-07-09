# Deploying Career OS Portfolio on Vercel

This guide deploys `deploy/portfolio-public` to Vercel with a low-cost setup. The public portfolio,
recruiter chat, private admin, encrypted job tracker, invite-only accounts, and resume download
endpoint all require server-side functions, so GitHub Pages is not enough for the full app.

## Recommended Low-Cost Stack

- Hosting and serverless functions: Vercel Hobby
- Encrypted job tracker and rate limits: Upstash Redis free tier
- AI responses: OpenAI API with a small model
- Bot challenge, optional later: Cloudflare Turnstile
- Analytics, optional: Vercel Web Analytics, Cloudflare Web Analytics, Plausible, or GoatCounter

Current official references:

- Vercel pricing: https://vercel.com/pricing
- Vercel managed infrastructure pricing: https://vercel.com/docs/pricing
- Upstash Redis pricing: https://upstash.com/pricing/redis
- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- Cloudflare Turnstile docs: https://developers.cloudflare.com/turnstile/

As of July 2026, Vercel Hobby is listed at `$0/mo` for personal projects, with included function,
bandwidth, analytics, and CDN limits. Upstash Redis lists a free tier with 256 MB data and 500K
commands per month. OpenAI API usage is usage-based, so set low in-app limits and billing alerts.

## What Costs Money

For personal use, the likely monthly cost is:

- Vercel: `$0` on Hobby if usage stays inside included limits.
- Upstash Redis: `$0` if the free database limits are enough.
- OpenAI: usage-based. For a personal portfolio, keep public chat and admin generation rate-limited.
- Domain: optional, usually `$10-$20/year` if you buy a custom domain.

Cost controls already in the app:

- public chat rate limits
- contact form bot friction
- resume download rate limits
- admin login rate limits when Redis is configured
- encrypted job tracker size limits
- admin-only AI generation

## Before Deploying

Confirm the deploy package works locally:

```powershell
cd C:\dev\app_ideas\career-os\deploy\portfolio-public
npm.cmd run check
```

Optional local server:

```powershell
$env:ADMIN_PASSCODE="local-owner-passcode"
$env:ADMIN_SESSION_SECRET="local-session-secret"
$env:ADMIN_DATA_ENCRYPTION_KEY="local-data-key"
$env:PORT="4174"
npm.cmd run dev
```

Open:

```text
http://localhost:4174
http://localhost:4174/admin.html
```

The local server is a lightweight Vercel-function shim. Full database behavior still requires
Upstash Redis environment variables.

## Create Upstash Redis

1. Create an Upstash account.
2. Create a Redis database.
3. Choose the free tier for personal testing.
4. Copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

This Redis database stores:

- encrypted admin job tracker blobs
- invite-only account records
- invite tokens
- login rate-limit counters
- chat/contact/download counters

The job tracker is encrypted before writing to Redis. Redis still needs to be treated as sensitive
infrastructure because it stores account records and rate-limit data.

## Create OpenAI API Key

1. Create or open your OpenAI Platform account.
2. Create an API key.
3. Add a small monthly budget or usage alert.
4. Start with a smaller model for cost control.

Recommended defaults:

```text
OPENAI_MODEL=gpt-4.1-mini
ADMIN_OPENAI_MODEL=gpt-4.1-mini
```

You can change models later without redeploying code by updating Vercel environment variables and
redeploying.

## Deploy to Vercel

1. Push the repository to GitHub.
2. Create a new Vercel project.
3. Import the GitHub repository.
4. Set **Root Directory** to:

```text
deploy/portfolio-public
```

5. Leave **Build Command** empty.
6. Leave **Output Directory** empty.
7. Add the environment variables below.
8. Deploy.

## Required Environment Variables

Set these in Vercel Project Settings > Environment Variables.

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
ADMIN_OPENAI_MODEL=gpt-4.1-mini

ADMIN_PASSCODE=...
ADMIN_SESSION_SECRET=...
ADMIN_DATA_ENCRYPTION_KEY=...
ADMIN_LOGIN_15M_LIMIT=8

UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

CHAT_MINUTE_IP_LIMIT=10
CHAT_DAILY_IP_LIMIT=50
CHAT_DAILY_SITE_LIMIT=500

CONTACT_DAILY_IP_LIMIT=5

DOWNLOAD_DAILY_IP_LIMIT=20
DOWNLOAD_DAILY_SITE_LIMIT=1000
DOWNLOAD_IP_HASH_SALT=...

TAVILY_API_KEY=...
BRAVE_SEARCH_API_KEY=...
```

Use long random values for:

- `ADMIN_PASSCODE`
- `ADMIN_SESSION_SECRET`
- `ADMIN_DATA_ENCRYPTION_KEY`
- `DOWNLOAD_IP_HASH_SALT`

Do not commit those values to Git.

`TAVILY_API_KEY` and `BRAVE_SEARCH_API_KEY` are optional. Configure one of them to enable private
admin web research with source URLs and snippets. If neither is configured, the rest of the app still
works and the web research button will report that search is not configured.

## Generate Strong Secrets

PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Run it separately for each secret.

Important: keep `ADMIN_DATA_ENCRYPTION_KEY` stable. If you change it, previously encrypted job data
cannot be decrypted.

## After Deployment

Open the public site:

```text
https://your-project.vercel.app
```

Open private admin:

```text
https://your-project.vercel.app/admin.html
```

Smoke test:

1. Public homepage loads.
2. Resume page loads.
3. Public chat responds without leaking private notes.
4. Admin owner passcode unlocks admin.
5. Job tracker loads without database errors.
6. Save a test job.
7. Refresh admin and confirm the test job persists.
8. Create an invite link from Owner Tools.
9. Open the invite link in a private/incognito window.
10. Create a friend account.
11. Confirm the friend account has an empty separate tracker.
12. Confirm friend account cannot use owner-only resume tailoring.
13. Run owner diagnostics from the admin dashboard.
14. Save an encrypted resume profile for a member account.
15. Generate tailoring from the member profile.
16. If a search provider key is configured, run web research and confirm sources are saved.

## Optional Custom Domain

In Vercel:

1. Open Project Settings.
2. Go to Domains.
3. Add your domain.
4. Follow the DNS instructions.

Keep `/admin.html` unlinked from public navigation. The page has `noindex,nofollow`, but access
control still depends on the admin login and secrets.

## Optional Bot Protection

For stronger bot friction, add Cloudflare Turnstile later.

Recommended places:

- contact form submission
- public recruiter chat
- resume download endpoint after suspicious activity
- admin login after repeated failures

Do not add Turnstile as the only security layer. Keep server-side rate limits.

## Optional Analytics

Low-cost choices:

- Vercel Web Analytics: convenient if you stay inside included events.
- Cloudflare Web Analytics: privacy-friendly and simple.
- Plausible or GoatCounter: good lightweight external analytics.

The included `analytics.js` respects Do Not Track and Global Privacy Control. Do not track raw IPs
for normal analytics. For abuse prevention, store salted hashes only.

## Production Safety Checklist

Before sharing the portfolio link:

- Confirm all required Vercel environment variables are set.
- Confirm `api/private-data`, `api/private-prompts`, and `api/private-templates` are not linked from
  public pages.
- Confirm public recruiter chat uses only `knowledge/public-profile.json`.
- Confirm admin login works.
- Confirm a member account cannot access owner-only resume tailoring.
- Confirm Redis persistence works by refreshing after saving a job.
- Confirm OpenAI billing alerts are enabled.
- Confirm Upstash free-tier usage is below limits.
- Confirm `ADMIN_DATA_ENCRYPTION_KEY` is backed up securely.

## Troubleshooting

### Admin login works locally but not on deployment

Check:

- `ADMIN_PASSCODE`
- `ADMIN_SESSION_SECRET`
- Vercel deployment environment is Production, not only Preview.
- Browser cookies are enabled.

### Job tracker says database is not configured

Check:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ADMIN_DATA_ENCRYPTION_KEY`

### Invite links fail

Check:

- Redis environment variables are set.
- Invite link is less than seven days old.
- The email is not already registered.

### AI chat or admin generation fails

Check:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `ADMIN_OPENAI_MODEL`
- OpenAI account billing and usage limits.

### Web research fails

Check:

- `TAVILY_API_KEY` or `BRAVE_SEARCH_API_KEY`
- Search provider quota
- Search provider billing
- Query length under 220 characters

### Costs are higher than expected

Lower these first:

- `CHAT_DAILY_SITE_LIMIT`
- `CHAT_DAILY_IP_LIMIT`
- `DOWNLOAD_DAILY_SITE_LIMIT`
- admin usage frequency

Then switch to a smaller model or disable public chat until needed.
