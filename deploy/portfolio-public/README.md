# Portfolio Public Deploy Package

Publish only this folder: `deploy/portfolio-public`.

This package intentionally excludes private source data, generated job-specific resumes, cover letters,
job descriptions, prompts, interview notes, recruiter messages, target-role match notes, and missing
information checklists.

## Vercel

Use Vercel as the primary host because the recruiter AI chat needs secure server-side functions.
For step-by-step low-cost deployment instructions, see `DEPLOY_VERCEL.md`.

Project setup:

1. Create a Vercel project from this repository.
2. Set the project root directory to `deploy/portfolio-public`.
3. Leave build command empty.
4. Leave output directory empty.
5. Add the environment variables below.
6. Deploy.

Required environment variables:

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
```

The OpenAI and Redis keys are used only by Vercel serverless functions. They are never shipped to
the browser.

## Private Admin V1

The private admin page is `admin.html`. It supports:

- owner passcode login with an HttpOnly session cookie
- invite-only friend accounts with email/password login
- paste job description
- generate a tailored Markdown package
- edit generated Markdown in-browser
- download Markdown locally
- track company, role, job URL, status, recruiter contact, compensation notes, follow-up date, and interview notes
- paste company research, interview reports, and coding challenge notes for a saved job
- generate a company snapshot, role summary, likely interview loop, practice questions, and coding/system design prep
- generate interview / phone screen prep from the saved job
- store the job tracker in an encrypted Redis-backed database
- export and import the job tracker as JSON backup

Required admin variables:

- `ADMIN_PASSCODE`: passcode used to unlock the admin page
- `ADMIN_SESSION_SECRET`: random long string used to sign the admin cookie
- `ADMIN_DATA_ENCRYPTION_KEY`: random long string used for AES-256-GCM encryption before job data is written to Redis
- `ADMIN_OPENAI_MODEL`: optional admin-specific model override
- `ADMIN_LOGIN_15M_LIMIT`: optional passcode attempt limit per hashed IP when Redis is configured

Invite-only accounts:

- The owner logs in with `ADMIN_PASSCODE`.
- The owner can create a seven-day invite link from the admin page.
- Invited users create an email/password account from the invite link.
- Each account gets a separate encrypted job tracker namespace in Redis.
- Each account gets a separate browser `localStorage` cache.
- V1 does not include public registration or forgot password.
- The owner-only resume tailor and private interview prep remain restricted to the owner until
  per-user resume profiles are added, because those endpoints use Rodrigue's private resume context.

Private context files live under `api/private-data`, `api/private-prompts`, and
`api/private-templates`. `vercel.json` bundles them only into the admin tailor function. Do not link
to those folders from public pages.

The company research generator does not browse the web. It summarizes the job description and any
research or interview notes pasted into the admin page. Reported or recent interview questions are
only treated as reported when they appear in the pasted notes; otherwise the output labels them as
inferred practice areas.

The admin job tracker is stored server-side as an encrypted blob in Redis. The browser keeps a
`localStorage` cache so the tracker remains usable if the database is temporarily unavailable. Use
`Export Jobs JSON` as a regular backup. Keep `ADMIN_DATA_ENCRYPTION_KEY` stable; changing it means
previously saved jobs cannot be decrypted.

## AI Chat Guardrails

The chat assistant uses `/api/chat` and is grounded only in `knowledge/public-profile.json`.

It must not answer from:

- Recruiter messages
- Target-role match scoring
- Interview prep notes
- Missing information checklists
- Private job descriptions
- Local file paths
- Hidden document metadata
- Salary expectations

Rate limits are enforced before any OpenAI request:

- 10 messages per minute per IP
- 50 messages per day per IP
- 500 messages per day for the site

Raw chat transcripts are stored only when the recruiter checks the storage-consent box. Stored chat
transcripts and contact submissions expire after 90 days.

The public privacy page is `privacy.html`.

## Resume Download Protection

The one-page PDF resume is served through `/api/download-resume` instead of a direct public link.
The endpoint uses Redis to count downloads and rate-limit abuse:

- 20 resume downloads per day per hashed IP by default
- 1,000 resume downloads per day for the site by default
- download events store a salted IP hash, not the raw IP address

Set `DOWNLOAD_IP_HASH_SALT` in Vercel so the hashed IP values cannot be compared across unrelated
systems.

## Contact Bot Friction

The contact form includes a hidden honeypot field named `companyWebsite`. Normal visitors do not see
or fill it. If an automated submission fills that field, `/api/contact` returns success without
storing the contact record.

## Analytics

`analytics.js` records local test events in browser `localStorage` and sends nothing externally unless
an endpoint is configured:

```html
<script src="analytics.js" data-site-id="portfolio-public" data-endpoint="https://your-endpoint.example/events"></script>
```

Recommended privacy-friendly options:

- Cloudflare Web Analytics for basic visit counts without cookies.
- Plausible or GoatCounter for lightweight page views and interaction events.
- A small serverless endpoint if you want to own the event data.

The script respects Do Not Track and Global Privacy Control signals.

## GitHub Pages

The old GitHub Pages workflow is now manual-only. Prefer Vercel for public deployment because GitHub
Pages cannot securely run the AI backend or enforce server-side IP rate limits.
