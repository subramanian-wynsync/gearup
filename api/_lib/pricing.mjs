// GearUp i-Book pricing — the ONE place prices live on the server.
// Keep /pricing.js (browser copy) identical in numbers; tests check they match.
// Amounts are in minor units: paise for INR, cents for USD and EUR.
export const BOOKS = {
  biw:      { name: 'Body in White',                            inr: 79900, usd: 849, eur: 749 },
  plastics: { name: 'Automotive Plastics & Glazing',            inr: 79900, usd: 849, eur: 749 },
  design:   { name: 'Cracking the Automotive Design Interview', inr: 59900, usd: 649, eur: 549 },
  fea:      { name: 'Cracking the FEA & Simulation Interview',  inr: 59900, usd: 649, eur: 549 },
  cfd:      { name: 'The Complete CFD Engineer',                inr: 59900, usd: 649, eur: 549 },
};
export const ALL = Object.keys(BOOKS);
// Discount on the cart total by number of books: 1 → 0 %, 2 → 10 %, 3 → 15 %, 4 → 20 %, 5 or more → 30 %.
export function discountFor(n){ return n >= 5 ? 0.30 : n === 4 ? 0.20 : n === 3 ? 0.15 : n === 2 ? 0.10 : 0; }
export const CURRENCIES = ['inr','usd','eur'];
const EUR_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','NO','IS','LI','CH']);
export function currencyForCountry(cc){
  cc = String(cc || '').toUpperCase();
  if (cc === 'IN') return 'inr';
  if (EUR_COUNTRIES.has(cc)) return 'eur';
  return 'usd';
}
export function quote(ids, currency){
  const cur = CURRENCIES.includes(currency) ? currency : 'usd';
  const list = [...new Set(ids)].filter(id => BOOKS[id]);
  const sum = list.reduce((t, id) => t + BOOKS[id][cur], 0);
  const d = discountFor(list.length);
  // INR totals round to whole rupees; USD/EUR to the cent.
  let total = Math.round(sum * (1 - d));
  if (cur === 'inr') total = Math.round(total / 100) * 100;
  return { currency: cur, ids: list, sum, total, discount: d, saved: sum - total };
}
