import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const OWNERS = [ (process.env.ADMIN_EMAIL||'').toLowerCase(), 'subramanian@wynstudio.se', 'subramanian@gearup.study', 'jhsubramanian87@gmail.com' ].filter(Boolean);
const BOOKS = ['biw','plastics','design','fea','cfd'];
const NAMES = { biw:'Body in White', plastics:'Plastics & Glazing', design:'Automotive Design', fea:'FEA & Simulation', cfd:'CFD Engineer' };

export default async function handler(req, res){
  const token = (req.headers.authorization||'').replace('Bearer ','');
  if(!token) return res.status(401).json({error:'no token'});
  const { data:{ user } } = await supabase.auth.getUser(token);
  if(!user || !OWNERS.includes((user.email||'').toLowerCase())) return res.status(403).json({error:'not authorized'});

  // all users
  let users=[], page=1;
  while(page<=20){ const { data } = await supabase.auth.admin.listUsers({ page, perPage:1000 }); if(!data?.users?.length) break; users.push(...data.users); if(data.users.length<1000) break; page++; }
  const uMap={}; users.forEach(u=>uMap[u.id]={email:u.email,created:u.created_at});

  const { data:pur }  = await supabase.from('purchases').select('user_id,email,book_id');
  const { data:prog } = await supabase.from('progress').select('user_id,book_id,pct,updated_at');
  const { data:profs }= await supabase.from('profiles').select('user_id,name');
  const nameMap={}; (profs||[]).forEach(p=>{ if(p.name) nameMap[p.user_id]=p.name; });

  const cust={};
  (pur||[]).forEach(r=>{ const id=r.user_id; if(!cust[id]) cust[id]={email:r.email||uMap[id]?.email||'', name:nameMap[id]||'', created:uMap[id]?.created||null, books:[], progress:{}}; if(!cust[id].books.includes(r.book_id)) cust[id].books.push(r.book_id); });
  (prog||[]).forEach(p=>{ if(cust[p.user_id]) cust[p.user_id].progress[p.book_id]={ pct:p.pct||0, updated:p.updated_at }; });
  const customers = Object.values(cust).sort((a,b)=> new Date(b.created||0) - new Date(a.created||0));

  const bookCounts={}; BOOKS.forEach(b=>bookCounts[b]=0);
  (pur||[]).forEach(r=>{ if(bookCounts[r.book_id]!=null) bookCounts[r.book_id]++; });

  // revenue from Stripe
  let gross=0, net=0, refunded=0, count=0, currency='usd';
  try{
    let starting_after, more=true, guard=0;
    while(more && guard<20){ guard++;
      const ch = await stripe.charges.list({ limit:100, ...(starting_after?{starting_after}:{}) });
      ch.data.forEach(c=>{ if(c.status==='succeeded'){ gross+=c.amount; net+=(c.amount-(c.amount_refunded||0)); refunded+=(c.amount_refunded||0); count++; currency=c.currency; } });
      more=ch.has_more; if(more && ch.data.length) starting_after=ch.data[ch.data.length-1].id; else more=false;
    }
  }catch(e){ /* revenue optional */ }

  res.status(200).json({
    revenue:{ gross:gross/100, net:net/100, refunded:refunded/100, count, currency:currency.toUpperCase() },
    customerCount: customers.length,
    bookCounts, bookNames: NAMES,
    customers
  });
}
