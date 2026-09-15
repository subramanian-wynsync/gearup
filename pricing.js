/* GearUp i-Book pricing — browser copy. Numbers must match api/_lib/pricing.mjs.
   Amounts are minor units (paise / cents). */
(function(){
  var BOOKS = {
    biw:      { inr: 79900, usd: 849, eur: 749 },
    plastics: { inr: 79900, usd: 849, eur: 749 },
    design:   { inr: 59900, usd: 649, eur: 549 },
    fea:      { inr: 59900, usd: 649, eur: 549 },
    cfd:      { inr: 59900, usd: 649, eur: 549 }
  };
  function discountFor(n){ return n >= 5 ? 0.30 : n === 4 ? 0.20 : n === 3 ? 0.15 : n === 2 ? 0.10 : 0; }
  var EUR = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE NO IS LI CH'.split(' ');
  function guessCurrency(){
    try{ var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (/Calcutta|Kolkata/.test(tz)) return 'inr';
      if (/^Europe\//.test(tz) && !/London|Dublin|Moscow|Istanbul|Kiev|Kyiv|Minsk/.test(tz)) return 'eur';
    }catch(e){}
    return 'usd';
  }
  var P = {
    BOOKS: BOOKS, discountFor: discountFor, currency: guessCurrency(),
    price: function(id){ return (BOOKS[id]||{})[P.currency] || 0; },
    fmt: function(minor, cur){ cur = cur || P.currency; var v = minor/100;
      if (cur === 'inr') return '₹' + Math.round(v).toLocaleString('en-IN');
      var s = (Math.round(v*100)/100).toFixed(2);
      return cur === 'eur' ? '€' + s : '$' + s; },
    quote: function(ids){ var list = ids.filter(function(id,i){ return BOOKS[id] && ids.indexOf(id)===i; });
      var sum = list.reduce(function(t,id){ return t + BOOKS[id][P.currency]; }, 0);
      var d = discountFor(list.length); var total = Math.round(sum*(1-d));
      if (P.currency === 'inr') total = Math.round(total/100)*100;
      return { sum: sum, total: total, discount: d, saved: sum-total, n: list.length }; },
    ready: null
  };
  // Ask the server which currency this visitor pays in (same rule the checkout uses).
  P.ready = fetch('/api/create-checkout-session').then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){ if (j && j.currency && BOOKS.biw[j.currency]) P.currency = j.currency; return P; })
    .catch(function(){ return P; });
  window.GU_PRICING = P;
})();
