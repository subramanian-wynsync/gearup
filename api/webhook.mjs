import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND = process.env.RESEND_API_KEY;
const FROM = 'Subramanian from GearUp <subramanian@gearup.study>';
const REPLY_TO = 'subramanian@gearup.study';
const SITE = 'https://gearup.study';
const BOOKS = ['biw','plastics','design','fea','cfd'];
const NAMES = { biw:'Body in White', plastics:'Automotive Plastics & Glazing', design:'Cracking the Automotive Design Interview', fea:'Cracking the FEA & Simulation Interview', cfd:'The Complete CFD Engineer' };
function mapName(n){ n=(n||'').toLowerCase();
  if(/all 5|all five|bundle/.test(n)) return 'bundle';
  if(/body in white/.test(n)) return 'biw';
  if(/plastic|glazing/.test(n)) return 'plastics';
  if(/fea|simulation/.test(n)) return 'fea';
  if(/cfd/.test(n)) return 'cfd';
  if(/design/.test(n)) return 'design';
  return null; }

function emailHTML({items, amount, currency, tempPw, isNew}){
  const rows = items.map(b=>`<tr><td style="padding:8px 0;border-bottom:1px solid #22304a;color:#dbe5f5;font-size:15px">${NAMES[b]||b}</td></tr>`).join('');
  const cred = isNew ? `
    <div style="background:#0e1930;border:1px solid #2a3b5c;border-radius:12px;padding:18px 20px;margin:22px 0">
      <div style="font-size:13px;color:#9fb2d4;margin-bottom:10px">Your login details</div>
      <div style="font-size:15px;color:#eaf1ff;margin:4px 0">Email: <b>this address</b></div>
      <div style="font-size:15px;color:#eaf1ff;margin:4px 0">Temporary password: <b style="font-family:monospace;background:#1a2942;padding:3px 8px;border-radius:6px;color:#ffcf8f">${tempPw}</b></div>
      <div style="font-size:13px;color:#9fb2d4;margin-top:10px">Log in with these, then change your password anytime in your profile.</div>
    </div>` : `
    <div style="background:#0e1930;border:1px solid #2a3b5c;border-radius:12px;padding:18px 20px;margin:22px 0;font-size:15px;color:#dbe5f5">
      Your new books are unlocked on your existing account. Just log in as usual.
    </div>`;
  return `<div style="background:#080d18;padding:32px 0;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#0c1424;border:1px solid #22304a;border-radius:18px;overflow:hidden">
      <div style="padding:26px 28px 8px"><div style="font-family:Arial,sans-serif;font-weight:800;font-size:22px;color:#eaf1ff">Gear<span style="color:#C88A4B">Up</span></div></div>
      <div style="padding:6px 28px 4px">
        <h1 style="font-size:21px;color:#fff;margin:14px 0 8px">Welcome 🔧 your books are ready</h1>
        <p style="color:#c3d1e8;font-size:15px;line-height:1.6;margin:8px 0">Thank you for your purchase. This is the guide set I wish I'd had breaking into automotive engineering, and I hope it earns its place in your prep.</p>
        <div style="font-size:12px;color:#8ea3c0;text-transform:uppercase;letter-spacing:.08em;margin:22px 0 4px">Your order</div>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <div style="display:flex;justify-content:space-between;padding:12px 0 2px;font-size:16px;color:#fff;font-weight:700"><span>Total paid</span><span>${amount} ${currency}</span></div>
        ${cred}
        <div style="text-align:center;margin:26px 0 8px">
          <a href="${SITE}/login.html" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;font-size:16px;text-decoration:none;padding:14px 30px;border-radius:10px">Log in &amp; start reading →</a>
        </div>
        <p style="color:#9fb2d4;font-size:13px;line-height:1.6;margin:20px 0 6px">If anything doesn't work, just hit reply. It comes straight to me, and I'll sort it out.</p>
      </div>
      <div style="padding:16px 28px 24px;border-top:1px solid #22304a;color:#6f83a6;font-size:12px">GearUp Press · Interactive engineering books · gearup.study</div>
    </div></div>`;
}

async function sendEmail(to, subject, html){
  if(!RESEND){ console.error('no RESEND_API_KEY'); return; }
  try{
    const r = await fetch('https://api.resend.com/emails', { method:'POST',
      headers:{ 'Authorization':'Bearer '+RESEND, 'Content-Type':'application/json' },
      body: JSON.stringify({ from: FROM, to:[to], reply_to: REPLY_TO, subject, html }) });
    if(!r.ok) console.error('resend error', await r.text());
  }catch(e){ console.error('resend fetch', e); }
}

export const config = { api:{ bodyParser:false } };
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
    if(items.includes('bundle')) items=BOOKS.slice();
    items=items.filter(b=>BOOKS.includes(b));
    if(email && items.length){
      // create user WITH a temp password; if they already exist, keep their password
      const tempPw = 'Gear-' + crypto.randomBytes(4).toString('hex');
      let uid=null, isNew=false;
      const { data:cr, error:ce } = await supabase.auth.admin.createUser({ email, password: tempPw, email_confirm:true });
      if(cr?.user){ uid=cr.user.id; isNew=true; }
      if(!uid){ const { data:l } = await supabase.auth.admin.listUsers(); uid=l?.users?.find(u=>u.email?.toLowerCase()===email)?.id||null; }
      if(uid){
        await supabase.from('purchases').upsert(items.map(b=>({user_id:uid,email,book_id:b})),{onConflict:'user_id,book_id'});
        const amount=((s.amount_total||0)/100).toFixed(2);
        const currency=(s.currency||'usd').toUpperCase();
        await sendEmail(email, isNew?'Welcome to GearUp 🔧 your books & login':'Your new GearUp books are ready 📘',
          emailHTML({items, amount, currency, tempPw, isNew}));
      }
      console.log('provisioned', email, items, 'new:', isNew);
    }
  }
  res.status(200).send('ok');
}
