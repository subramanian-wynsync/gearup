# GearUp Interview Coach — your step-by-step setup

Built entirely on YOUR stack: same GitHub repo, same Vercel, same Supabase,
your own OpenAI key. No Render, no MongoDB, no other team needed.

---

## Step 1 — Create your own OpenAI API key (~5 min)

1. Go to https://platform.openai.com and sign in (or create an account with
   your own email).
2. Add billing: Settings → Billing → add your card, and set a **monthly
   budget limit** (start with $20 — Settings → Limits). This is your safety cap.
3. Create a key: Dashboard → API keys → "Create new secret key".
   Name it `gearup-coach`. Copy it — it is shown only once.
4. NEVER paste this key into chat or files. It goes only into Vercel (Step 3).

Model used: gpt-4.1-mini (cheap: a full text interview costs roughly $0.05–0.10).

## Step 2 — Supabase: create the Coach tables (~2 min)

Supabase dashboard → SQL Editor → paste and Run:

```sql
create table if not exists coach_chunks (
  id bigint generated always as identity primary key,
  book text not null,
  chapter_n int,
  chapter_title text,
  topic_title text,
  content text,
  fts tsvector generated always as
    (to_tsvector('english', coalesce(topic_title,'') || ' ' ||
     coalesce(chapter_title,'') || ' ' || coalesce(content,''))) stored
);
create index if not exists coach_chunks_fts on coach_chunks using gin(fts);
create index if not exists coach_chunks_book on coach_chunks(book);

create table if not exists coach_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  email text,
  skills text[],
  difficulty text,
  plan jsonb,
  resume_text text,
  qa jsonb default '[]',
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists coach_usage (
  email text not null,
  month text not null,
  interviews int default 0,
  primary key (email, month)
);

create table if not exists coach_subscriptions (
  email text primary key,
  plan text default 'coach-monthly',
  active_until timestamptz,
  source text,
  updated_at timestamptz default now()
);

alter table coach_chunks enable row level security;
alter table coach_sessions enable row level security;
alter table coach_usage enable row level security;
alter table coach_subscriptions enable row level security;

-- free-demo gate (2 questions per email, once) — column on your existing leads table
alter table leads add column if not exists coach_demo_at timestamptz;

-- v2: interview modes, practice-role targeting, video quota
alter table coach_sessions add column if not exists mode text default 'text';
alter table coach_sessions add column if not exists job jsonb;
alter table coach_usage add column if not exists video int default 0;
-- no policies on purpose: only the server (service role) touches these
```

## Step 3 — Vercel: add environment variables (~3 min)

Vercel dashboard → gearup project → Settings → Environment Variables → add:

| Name | Value |
|---|---|
| OPENAI_API_KEY | the key from Step 1 |
| COACH_FREE | 1  (testing mode — no subscription needed; set to 0 at launch) |
| INTERVIEWS_PER_MONTH | 50 |
| QUESTIONS_PER_INTERVIEW | 12 |
| COACH_DEMO_QUESTIONS | 2  (free demo questions per email) |
| VIDEO_INTERVIEWS_PER_MONTH | 8 |
| RESEND_API_KEY | already exists — used for the post-interview report email |
| COACH_PRICE_CENTS | 599  (the $5.99/month subscription price) |
| B2B_ADMIN_KEY | a long random string YOU invent (30+ characters — treat it like a password). This unlocks the college batch-licensing panel on coach-b2b.html. |

(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
CRON_SECRET already exist from before.)

Then: Deployments → ⋯ on the latest → Redeploy (env changes need a redeploy).

## Step 4 — GitHub: upload to a PRIVATE STAGING BRANCH (not the live site)

Your requirement: test everything privately first, never disturb current
visitors. Vercel gives you this for free with branch previews:

1. In GitHub, open your repo. Click the branch dropdown (it says `main`),
   type **coach-staging**, click "Create branch: coach-staging from main".
2. Make sure the dropdown now shows **coach-staging**. Upload the new files
   (Add file → Upload files):
   - `coach.html` (the Coach app)
   - `coach-b2b.html` (colleges page + your admin panel)
   - `coach-jobs.json` (practice openings)
   - `index.html` (store page with the new Interview Coach card — replaces the old one ON THIS BRANCH only; the live site keeps its current index.html until you merge)
   - the `api` folder with: `coach-index.mjs`, `coach-interview.mjs`,
     `coach-checkout.mjs`, `coach-b2b.mjs`, and `webhook.mjs` (this REPLACES the
     existing webhook.mjs — it keeps the book logic and adds the Coach
     subscription handling)
   In the commit box, keep "Commit directly to the coach-staging branch" → Commit.
3. Vercel automatically builds a PREVIEW: Vercel dashboard → gearup →
   Deployments → the newest entry marked "Preview · coach-staging" → Visit.
   Your private test link looks like `gearup-git-coach-staging-….vercel.app`.
   **www.gearup.study is completely untouched.**
4. If the preview link asks for a Vercel login, that is Deployment Protection.
   Either just log in with your own Vercel account in that browser, or turn it
   off: Vercel → Settings → Deployment Protection → disable for Previews
   (then keep the link private — anyone with it can view).
5. Environment variables: when you add the Step-3 vars, leave the environment
   set to "All Environments" so the preview gets them too.
6. Note: preview and production share the SAME Supabase. That is safe — the
   coach tables are brand new (current visitors never touch them), and any
   demo emails you test with land in your real `leads` table (delete test
   rows there if you wish). Your normal login works on the preview.
7. **Go-live later:** when you have tested everything on the preview, switch
   the GitHub branch dropdown back to `main`, upload the SAME files, commit —
   production deploys. (Equivalent: open the "Compare & pull request" banner
   and click Merge.)

## Step 5 — Index the books (one time, ~1 min)

(One run fills Supabase for BOTH preview and production — the database is shared.)

Open these five URLs in your browser, one after another
(replace YOUR_CRON_SECRET with the CRON_SECRET value from Vercel):

- https://www.gearup.study/api/coach-index?book=fea&secret=YOUR_CRON_SECRET
- https://www.gearup.study/api/coach-index?book=cfd&secret=YOUR_CRON_SECRET
- https://www.gearup.study/api/coach-index?book=design&secret=YOUR_CRON_SECRET
- https://www.gearup.study/api/coach-index?book=biw&secret=YOUR_CRON_SECRET
- https://www.gearup.study/api/coach-index?book=plastics&secret=YOUR_CRON_SECRET

Each should reply {"ok":true,"book":"...","chunks":NNN}. That fills the
question knowledge base from your books in Supabase Storage.

## Step 6 — Test it (including the free demo)

Demo first (logged OUT — open a private/incognito window):
1. Go to https://www.gearup.study/coach.html — you get the free-demo screen.
2. Enter an email + tick consent → answer the 2 free questions → see the demo
   report with the chapter recommendations and the $5.99 pitch.
3. Try the same email again — it should say the demo was already used.
4. Check Supabase → leads: the email is there with source 'coach-demo'
   (it now also receives your nurture emails automatically).

Then the full flow:

1. Go to https://www.gearup.study/coach.html
2. Log in with your GearUp account (it will prompt if you are not).
3. Skills: "FEA, meshing" → Start interview.
4. Answer a question badly on purpose — check the score, feedback, model
   answer, language tip, and the follow-up question.
5. Finish and check the report recommends chapters with links into your reader.
6. Try Voice mode in Chrome: questions read aloud, answer via the mic
   (this uses the browser's built-in speech — costs you $0).

## Step 7 — Stripe: the $5.99/month subscription (~10 min)

The Coach reuses your existing Stripe account and your existing webhook
endpoint (/api/webhook). Two things to do:

**A. Add the subscription events to your webhook (for go-live).**
Stripe dashboard → Developers → Webhooks → click your existing
`https://www.gearup.study/api/webhook` endpoint → "… " → Update details →
under "Events to send", ADD these two (keep checkout.session.completed):
- `invoice.paid` (monthly renewals extend access)
- `customer.subscription.deleted` (cancellations)

**B. Test payments safely on the preview (no real money).**
Vercel lets you give the PREVIEW different keys than production:
1. Stripe dashboard → toggle **Test mode** (top right).
2. Developers → API keys → copy the test **Secret key** (starts sk_test_).
3. Developers → Webhooks → Add endpoint →
   URL: `https://YOUR-PREVIEW-URL.vercel.app/api/webhook`
   (your coach-staging preview link) → select the 3 events above → Add.
   Copy its **Signing secret** (whsec_…).
4. Vercel → Settings → Environment Variables:
   - Add `STRIPE_SECRET_KEY` with the sk_test_ value, environment: **Preview only**.
   - Add `STRIPE_WEBHOOK_SECRET` with the test whsec_ value, environment: **Preview only**.
   (Production keeps your live keys — Vercel picks per environment.)
5. Redeploy the preview. Now on the preview you can subscribe with Stripe's
   test card **4242 4242 4242 4242**, any future date, any CVC — no real charge.
6. After paying you should get: the welcome email, a row in
   `coach_subscriptions` (Supabase → Table Editor), and with COACH_FREE=0 the
   interview should start. Cancel test subscriptions in Stripe test mode →
   Customers.

**At launch:** set `COACH_FREE` to `0` (Vercel env) and redeploy — from then
on only subscribers (and B2B students) can start full interviews; everyone
else gets the demo + subscribe button.

## Step 8 — B2B colleges (when the first placement cell says yes)

- Your public pitch page: `gearup.study/coach-b2b.html` — share this link with
  placement officers. Inquiries land in your inbox and in the leads table.
- Activating a batch: open coach-b2b.html → Administrator → enter your
  B2B_ADMIN_KEY → "Grant a batch": batch name (e.g. `ABC-Chennai-2027`),
  months of access, paste up to 100 student emails → Activate. Every student
  gets an account + welcome email with a set-password button automatically.
- Usage report: same panel → "Load report" shows, per batch: students, active
  licenses, how many practised this month and total interviews — perfect for
  the renewal conversation with the college.
- Pricing is up to you (it is a manual invoice to the college — bank transfer
  or a Stripe payment link you create in the dashboard). A sane starting
  point: $2–3 per student per month for 50+ students, 6-month season.

## Security housekeeping (please do these)

- ROTATE the old keys from the India-team zip: OpenAI (delete old key) and
  MongoDB Atlas password. That stack is retired but the keys are live.
- The five book JSONs (fea.json etc.) sit in the GitHub repo root, which means
  anyone could download them directly from your domain. The site doesn't use
  them (books are served from private Supabase Storage), so DELETE these five
  files from the GitHub repo: fea.json, cfd.json, design.json, biw.json,
  plastics.json. (Keep the small demo/ folder — that one is intentional.)

## What is now included (v2)

- Free demo (2 questions per email) → feeds your leads + nurture emails
- Practice-role matcher: 24 realistic openings across OEM / Tier-1 / EV
  startup / consultancy; the chosen role shapes the questions
- Text, Voice (spoken Q&A) and Video modes — video adds a live camera check
  with lighting meter and framing tips (all on-device, zero AI cost)
- Delivery metrics when speaking: words/min pace + filler-word count,
  reflected in the language feedback
- Follow-up questions on weak answers; chapter-cited feedback with reader links
- Progress page (score trend across interviews)
- Post-interview report email from subramanian@gearup.study
- Quotas: 50 interviews/month, 8 video, 12 questions each (env-configurable)

## What is now included (v3 — complete)

- **Payments**: $5.99/month Stripe subscription (coach-checkout.mjs) + webhook
  that activates coach_subscriptions, creates the account and sends the
  welcome/set-password email; renewals extend access automatically.
- **Product card** on the store page with the free-demo button, plus the
  "Electrical · Civil · EV — coming soon" waitlist feeding your leads table.
- **B2B**: coach-b2b.html (college pitch + inquiry form + your key-protected
  admin panel) and coach-b2b.mjs (bulk license grants + usage reports).

## Still on the list (later)

- One-time book coupon codes for Coach subscribers (needs Stripe coupon setup).
- Indian payment gateway (Razorpay) for INR pricing — parked until you say go.

## Two small things I noticed (FYI)

- `vercel.json` schedules `/api/cron-emails` daily, but there is no
  `cron-emails.mjs` in your site folder's api directory — if it is also
  missing on GitHub, that cron simply fails quietly every morning. Tell me if
  you want it removed or rebuilt.
- Vercel's free plan allows 12 serverless functions per deployment. With the
  Coach complete you are at 11 — room for exactly one more (the Razorpay
  endpoint, when we get to it).
