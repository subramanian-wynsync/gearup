import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { BOOKS, ALL, quote, currencyForCountry } from './_lib/pricing.mjs';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Public cover art shown on the Stripe checkout line items (canonical www domain).
const IMG_BASE = 'https://www.gearup.study/covers';

export default async function handler(req, res) {
  // GET → which currency this visitor pays in (same geo rule as checkout), used by /pricing.js
  if (req.method === 'GET') { res.setHeader('Cache-Control','private, no-store'); return res.status(200).json({ currency: currencyForCountry(req.headers['x-vercel-ip-country']), country: req.headers['x-vercel-ip-country'] || '' }); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let { items } = req.body || {};
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = [items]; } }
    if (!Array.isArray(items)) items = [];

    // Normalise: a "bundle" pick means all five books.
    let ids = [...new Set(items)];
    if (ids.includes('bundle')) ids = [...ALL];
    ids = ids.filter(id => BOOKS[id]);
    if (!ids.length) return res.status(400).json({ error: 'Your cart is empty' });

    // Currency follows the visitor's country (same rule as /api/pricing, so the price shown is the price charged).
    const currency = currencyForCountry(req.headers['x-vercel-ip-country']);

    // If the buyer is signed in, tie the purchase to their account.
    let user = null;
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) { try { const { data } = await supabase.auth.getUser(token); user = data?.user || null; } catch {} }

    // Never charge a signed-in reader again for an i-Book they already own.
    if (user) {
      const { data: pur } = await supabase.from('purchases').select('book_id').eq('user_id', user.id);
      const owned = new Set((pur || []).map(r => r.book_id));
      if (owned.has('bundle')) ALL.forEach(id => owned.add(id));
      ids = ids.filter(id => !owned.has(id));
      if (!ids.length) return res.status(400).json({ error: 'You already own these i-Books. Open them from My i-Books.' });
    }
    const q = quote(ids, currency);

    const origin = req.headers.origin || (req.headers.host ? 'https://' + req.headers.host : '');

    // Full-price line items (itemised so the receipt lists each book).
    const line_items = q.ids.map(id => ({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: BOOKS[id][currency],
        product_data: { name: BOOKS[id].name, images: [`${IMG_BASE}/${id}.jpg`] },
      },
    }));

    const discounts = [];
    if (q.saved > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: q.saved,
        currency,
        duration: 'once',
        name: q.ids.length >= 5 ? 'All 5 i-Books: 30% off' : `${q.ids.length} i-Books: ${Math.round(q.discount * 100)}% off`,
      });
      discounts.push({ coupon: coupon.id });
    }

    const meta = { gearup_items: q.ids.join(','), gearup_currency: currency };
    if (user) meta.gearup_uid = user.id;

    const params = {
      mode: 'payment',
      line_items,
      discounts,
      metadata: meta,
      payment_intent_data: { metadata: meta },
      success_url: origin + (user ? '/portal.html?paid=1' : '/login.html?welcome=1'),
      cancel_url: origin + (user ? '/portal.html' : '/#books'),
      billing_address_collection: 'auto',
    };
    if (user?.email) params.customer_email = user.email;
    const session = await stripe.checkout.sessions.create(params);

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session', e);
    return res.status(500).json({ error: 'Checkout unavailable — please try again' });
  }
}
