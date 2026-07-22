import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Catalogue — prices in USD. No Stripe Price IDs needed: line items are built inline.
const CAT = {
  biw:      { name: 'Body in White',                            price: 29 },
  plastics: { name: 'Automotive Plastics & Glazing',            price: 29 },
  design:   { name: 'Cracking the Automotive Design Interview', price: 19 },
  fea:      { name: 'Cracking the FEA & Simulation Interview',  price: 19 },
  cfd:      { name: 'The Complete CFD Engineer',                price: 19 },
};
const ALL = ['biw','plastics','design','fea','cfd'];
const BUNDLE_PRICE = 79;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let { items } = req.body || {};
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = [items]; } }
    if (!Array.isArray(items)) items = [];

    // Normalise: a "bundle" pick means all five books.
    let ids = [...new Set(items)];
    if (ids.includes('bundle')) ids = [...ALL];
    ids = ids.filter(id => CAT[id]);
    if (!ids.length) return res.status(400).json({ error: 'Your cart is empty' });

    const origin = req.headers.origin
      || (req.headers.host ? 'https://' + req.headers.host : '');

    // Full-price line items (itemised so the receipt lists each book).
    const line_items = ids.map(id => ({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: CAT[id].price * 100,
        product_data: { name: CAT[id].name },
      },
    }));

    // Multi-buy discount — mirrors the cart on the store.
    const sum = ids.reduce((t, id) => t + CAT[id].price, 0);
    let total = sum;
    const n = ids.length;
    if (n >= 5)      total = BUNDLE_PRICE;
    else if (n >= 3) total = Math.round(sum * 0.85);
    else if (n === 2) total = Math.round(sum * 0.92);

    const discounts = [];
    if (total < sum) {
      const coupon = await stripe.coupons.create({
        amount_off: (sum - total) * 100,
        currency: 'usd',
        duration: 'once',
        name: n >= 5 ? 'Full library bundle' : `Multi-book discount (${n} books)`,
      });
      discounts.push({ coupon: coupon.id });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      discounts,
      metadata: { gearup_items: ids.join(',') },
      payment_intent_data: { metadata: { gearup_items: ids.join(',') } },
      success_url: origin + '/login.html?welcome=1',
      cancel_url: origin + '/',
      billing_address_collection: 'auto',
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session', e);
    return res.status(500).json({ error: 'Checkout unavailable — please try again' });
  }
}
