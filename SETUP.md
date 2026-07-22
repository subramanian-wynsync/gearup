# GearUp — deploy runbook (Payment Links + login + gated books)

Store buy buttons open your Stripe Payment Links directly. The Vercel backend only handles:
account creation after payment (webhook) + serving books to buyers (book-url). Simpler env now.

## A. Books in Supabase Storage — DONE (bucket `books`, files biw/plastics/design/fea/cfd.html)

## B. Deploy to Vercel
1. Put this folder in a GitHub repo → import on vercel.com.
2. Environment Variables (only 4 — all typed by you):
   - STRIPE_SECRET_KEY = your sk_test_...
   - STRIPE_WEBHOOK_SECRET = whsec_... (from step C)
   - SUPABASE_URL = https://pzcitptxyftlrkvvpuji.supabase.co
   - SUPABASE_SERVICE_ROLE_KEY = your Supabase service_role secret
3. Deploy → note your URL (e.g. https://gearup-xxx.vercel.app).

## C. Stripe webhook
Developers → Webhooks → add https://YOURSITE/api/webhook → event checkout.session.completed
→ copy signing secret into STRIPE_WEBHOOK_SECRET → redeploy.

## D. Point each Payment Link back to the site (so buyers log in after paying)
For each of your 6 Payment Links → edit → "After payment" → Redirect →
  https://YOURSITE/login.html?welcome=1

## E. Test (test mode)
Open your site → Buy a book → pay with 4242 4242 4242 4242 → redirected to login →
enter that email → magic-link → book unlocks from your private bucket.

## Going live later
Activate Stripe → recreate the 6 Payment Links in Live mode → send me the live URLs (I swap them)
→ switch to live keys. ~10 min.
