import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const WHSEC=process.env.STRIPE_WEBHOOK_SECRET;
const supabase=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BOOKS=['biw','plastics','design','fea','cfd'];
function mapName(n){ n=(n||'').toLowerCase();
  if(/all 5|all five|bundle/.test(n)) return 'bundle';
  if(/body in white/.test(n)) return 'biw';
  if(/plastic|glazing/.test(n)) return 'plastics';
  if(/fea|simulation/.test(n)) return 'fea';
  if(/cfd/.test(n)) return 'cfd';
  if(/design/.test(n)) return 'design';
  return null; }
export const config={api:{bodyParser:false}};
export default async function handler(req,res){
  const ch=[]; for await(const c of req) ch.push(c); const raw=Buffer.concat(ch);
  let ev; try{ ev=stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], WHSEC); }
  catch(e){ return res.status(400).send('bad signature: '+e.message); }
  if(ev.type==='checkout.session.completed'){
    const s=ev.data.object;
    const email=(s.customer_details?.email||s.customer_email||'').toLowerCase();
    let items=[];
    if(s.metadata?.gearup_items){ items=s.metadata.gearup_items.split(',').filter(Boolean); }
    else { try{ const li=await stripe.checkout.sessions.listLineItems(s.id,{expand:['data.price.product'],limit:20});
      for(const l of li.data){ const id=mapName(l.price?.product?.name||l.description); if(id&&!items.includes(id)) items.push(id); }
    }catch(e){ console.error('lineitems',e); } }
    if(items.includes('bundle')) items=BOOKS;
    if(email && items.length){
      let uid=null; const {data:cr}=await supabase.auth.admin.createUser({email,email_confirm:true});
      if(cr?.user) uid=cr.user.id;
      if(!uid){ const {data:l}=await supabase.auth.admin.listUsers(); uid=l?.users?.find(u=>u.email?.toLowerCase()===email)?.id||null; }
      if(uid) await supabase.from('purchases').upsert(items.map(b=>({user_id:uid,email,book_id:b})),{onConflict:'user_id,book_id'});
      console.log('provisioned', email, items);
    }
  }
  res.status(200).send('ok');
}
