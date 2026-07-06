# AIWEBBB v3 — Setup Guide

One Platform. All Top AIs. — ChatGPT · Claude · Gemini · Grok · DeepSeek · 100+ Models

---

## What changed in this version

**Security fix (the big one):** Your OpenRouter key and Razorpay secret key
never touch the browser anymore. They live only in Vercel's environment
variables and are used exclusively inside the `/api` serverless functions.
This is why the project is now multiple files instead of one HTML file —
there's no other way to keep a secret key secret on a static site.

**Real backend, not demo mode:**
- Real Supabase authentication (email/password + Google/GitHub OAuth ready)
- Chat messages are saved to Supabase and reload when you reopen a conversation
- Razorpay payments are verified server-side before credits are ever added
- Three new working pages:
  - **Prompts Library** — save one specific prompt+response pair (tap 🔖 on any AI reply)
  - **Documents** — upload files for the AI; auto-deleted after 7 days
  - **Projects** — AI-generated images/tool outputs; auto-deleted after 7 days

---

## Architecture

No Next.js, no build step — this avoids every build error you hit before.

| Piece | What it is |
|---|---|
| `index.html` | The entire frontend — one static file |
| `api/config.js` | Serves public config (Supabase URL, anon key, Razorpay key id) from env vars |
| `api/chat.js` | Edge Function — streams OpenRouter responses, hides your OpenRouter key |
| `api/razorpay/create-order.js` | Creates a Razorpay order server-side |
| `api/razorpay/verify.js` | Verifies payment signature, then credits the user |
| `supabase-schema.sql` | Full database schema — run once in Supabase |
| `package.json` | Just two dependencies for the API functions |

---

## 1. Supabase Setup

1. Open your Supabase project → **SQL Editor** → paste all of `supabase-schema.sql` → **Run**
2. Go to **Storage** — confirm a bucket called `documents` now exists (the schema creates it). If it's missing, create it manually and mark it **private**.
3. Go to **Authentication → Providers** → enable **Email**. Enable **Google**/**GitHub** too if you want those sign-in buttons to work (each needs its own OAuth app configured in that provider's dashboard).
4. Go to **Authentication → URL Configuration**:
   - Site URL: `https://aiwebbb.pro`
   - Redirect URLs: `https://aiwebbb.pro/**`
5. Copy your keys from **Settings → API**:
   - Project URL
   - `anon` `public` key
   - `service_role` key (keep this one secret)

---

## 2. Vercel Environment Variables

Go to your Vercel project → **Settings → Environment Variables** and add:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...
OPENROUTER_API_KEY=sk-or-...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
APP_URL=https://aiwebbb.pro
```

That's it — 7 variables, all read only by the server. Nothing needs to be
edited inside `index.html` itself.

**Framework Preset:** In Vercel → **Settings → Build & Deployment**, set
Framework Preset to **Other**, leave Build Command and Output Directory
empty. There is no build step for this project.

---

## 3. Razorpay — India + International cards

Your existing Razorpay account (`razorpay.me/@aiwebbb`) already accepts
domestic India payments. To accept **international cards** too:

1. Razorpay Dashboard → **Account & Settings → International Payments**
2. Complete the additional KYC Razorpay asks for international acceptance
3. Once approved, no code changes are needed — the same `create-order`/`verify`
   endpoints handle both automatically, since Razorpay Checkout shows the
   right payment methods based on the customer's card/location.

---

## 4. GitHub → Vercel

```
index.html                              → repo root
package.json                            → repo root
api/config.js                           → api/config.js
api/chat.js                             → api/chat.js
api/razorpay/create-order.js            → api/razorpay/create-order.js
api/razorpay/verify.js                  → api/razorpay/verify.js
supabase-schema.sql                     → run in Supabase, do NOT commit as a public file if you'd rather keep it private (optional either way — it has no secrets in it)
```

Push to GitHub → Vercel redeploys automatically. No build errors possible
since there's no build step.

---

## How credits are calculated

Every paid-plan (Pro/Plus) AI response includes a token count from
OpenRouter. AIWEBBB charges a flat **5 credits per 1,000 combined tokens**
(input + output), deducted immediately via a Supabase function that can
only ever touch the signed-in user's own balance. Free-tier models always
cost 0 credits. This is intentionally simple — if you want per-model
pricing later (e.g. GPT-4o costing more than Haiku), that's a small
addition to `deduct_credits` plus a lookup table, and I'm happy to build
that next.

## Documents & Projects auto-expiry

Both tables get an `expires_at` column set to 7 days after creation. Every
time the Documents or Projects page loads, the app calls a Postgres
function (`cleanup_expired`) that deletes anything past its expiry for the
current user before showing the list — no cron job needed, works on every
Supabase plan.

## AI Image Generator — please read

The "AI Image Generator" tool card now actually calls OpenRouter's
`black-forest-labs/flux-schnell` model and saves the result to Projects.
I want to be upfront: I could not test this live against your real
OpenRouter account, and different image models return their result in
slightly different formats. If it fails after deploying, tell me the exact
error message shown in the modal and I'll adjust the response parsing —
this is a quick fix, not a rebuild. All other AI Tools cards currently show
"coming soon" rather than a fake result.
