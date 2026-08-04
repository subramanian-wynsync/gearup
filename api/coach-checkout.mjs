// GearUp Interview Coach — $6.99/month subscription checkout (Stripe).
// POST {} with Authorization (logged-in) OR { email } (guest, e.g. from the demo).
// The webhook (coach-webhook.mjs) activates the subscription and creates the
// GearUp account if the subscriber does not have one yet.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRICE_USD_CENTS = parseInt(process.env.COACH_PRICE_CENTS || '699', 10);

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let email = null;
    const h = req.headers.authorization || '';
    if (h.toLowerCase().startsWith('bearer ')) {
      const { data } = await supabase.auth.getUser(h.slice(7).trim());
      email = data?.user?.email || null;
    }
    if (!email) {
      email = String((req.body || {}).email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
        return res.status(400).json({ error: 'Please log in or provide a valid email.' });
    }
    const origin = req.headers.origin || (req.headers.host ? 'https://' + req.headers.host : 'https://www.gearup.study');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: PRICE_USD_CENTS,
          recurring: { interval: 'month' },
          product_data: {
            name: 'GearUp Interview Coach (monthly)',
            description: 'Up to 50 AI mock interviews a month (8 video), trained on the GearUp engineering books.',
            images: ['https://www.gearup.study/og-image.jpg'],
          },
        },
      }],
      metadata: { gearup_coach: '1' },
      subscription_data: { metadata: { gearup_coach: '1' } },
      success_url: origin + '/coach.html?sub=1',
      cancel_url: origin + '/coach.html',
      billing_address_collection: 'auto',
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('coach-checkout', e);
    return res.status(500).json({ error: 'Checkout unavailable, please try again.' });
  }
}
