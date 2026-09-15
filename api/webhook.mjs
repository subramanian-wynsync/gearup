// GearUp — Stripe webhook: book purchases (checkout.session.completed → purchases table + buyer email).
// In the Stripe dashboard the webhook only needs the checkout.session.completed event.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { send as sendMail, wrap, btn, H, NAMES, SITE, findUserByEmail } from './_lib/mail.mjs';
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const WHSEC=process.env.STRIPE_WEBHOOK_SECRET;
const supabase=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND=process.env.RESEND_API_KEY;
const FROM='Subramanian from GearUp <subramanian@gearup.study>';
const BOOKS=['biw','plastics','design','fea','cfd'];

function mapName(n){ n=(n||'').toLowerCase();
  if(/all 5|all five|bundle/.test(n)) return 'bundle';
  if(/body in white/.test(n)) return 'biw';
  if(/plastic|glazing/.test(n)) return 'plastics';
  if(/fea|simulation/.test(n)) return 'fea';
  if(/cfd/.test(n)) return 'cfd';
  if(/design/.test(n)) return 'design';
  return null; }

async function ensureUser(email){
  const {data:cr}=await supabase.auth.admin.createUser({email,email_confirm:true});
  if(cr?.user) return {uid:cr.user.id, created:true};
  const u=await findUserByEmail(supabase, email);   // paged lookup, works past 50 users
  return {uid:u?.id||null, created:false};
}

// Buyer welcome: new buyers get a set-password link; existing readers are told their books are unlocked.
async function bookWelcome(email, items, created){
  const list=items.map(b=>`<li style="margin:5px 0">${NAMES[b]||b}</li>`).join('');
  let access;
  if(created){
    let link=SITE+'/login.html';
    try{ const {data}=await supabase.auth.admin.generateLink({type:'recovery', email, options:{ redirectTo: SITE+'/reset.html' }});
      if(data?.properties?.action_link) link=data.properties.action_link; }catch(e){ console.error('genlink',e); }
    access=`<p>Your GearUp login was created with this email. Choose your password to open your books:</p>`+btn('Set my password →', link)+
      `<p style="color:#9fb2d4;font-size:13px">The button expires after a while. If it does, use "Forgot password" on the login page.</p>`;
  } else {
    access=`<p>They are already unlocked on your account. Log in with your usual email and password:</p>`+btn('Open my i-Books →', SITE+'/portal.html');
  }
  await sendMail(email, 'Your GearUp i-Books are unlocked 📘', wrap(H('Thank you, your i-Books are ready')+
    `<p>Payment received. You now have lifetime access to:</p><ul style="color:#dbe5f5;padding-left:20px">${list}</ul>`+access+
    `<p style="color:#9fb2d4;font-size:13px">Any problem at all, just reply to this email.</p>`));
}

async function sendEmail(to, subject, html){
  if(!RESEND) return;
  try{
    await fetch('https://api.resend.com/emails',{method:'POST',
      headers:{'Authorization':'Bearer '+RESEND,'Content-Type':'application/json'},
      body:JSON.stringify({from:FROM,to,subject,html})});
  }catch(e){ console.error('resend',e); }
}

export const config={api:{bodyParser:false}};
export default async function handler(req,res){
  const ch=[]; for await(const c of req) ch.push(c); const raw=Buffer.concat(ch);
  let ev; try{ ev=stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], WHSEC); }
  catch(e){ return res.status(400).send('bad signature: '+e.message); }

  try{
    // ---------- checkout completed: book purchase ----------
    if(ev.type==='checkout.session.completed'){
      const s=ev.data.object;
      const email=(s.customer_details?.email||s.customer_email||'').toLowerCase();

      {
        let items=[];
        if(s.metadata?.gearup_items){ items=s.metadata.gearup_items.split(',').filter(Boolean); }
        else { try{ const li=await stripe.checkout.sessions.listLineItems(s.id,{expand:['data.price.product'],limit:20});
          for(const l of li.data){ const id=mapName(l.price?.product?.name||l.description); if(id&&!items.includes(id)) items.push(id); }
        }catch(e){ console.error('lineitems',e); } }
        if(items.includes('bundle')) items=BOOKS;
        if(email && items.length){
          // Signed-in buyers carry their account id, so the books land on that account even if they typed another email at checkout.
          let uid=s.metadata?.gearup_uid||null, created=false, acctEmail=email;
          if(uid){ const {data:gu}=await supabase.auth.admin.getUserById(uid); if(gu?.user){ acctEmail=(gu.user.email||email).toLowerCase(); } else uid=null; }
          if(!uid){ const r=await ensureUser(email); uid=r.uid; created=r.created; }
          if(uid){
            await supabase.from('purchases').upsert(items.map(b=>({user_id:uid,email:acctEmail,book_id:b})),{onConflict:'user_id,book_id'});
            await bookWelcome(acctEmail, items, created);
          }
          console.log('provisioned', acctEmail, items);
        }
      }
    }

  }catch(e){ console.error('webhook handler', e); }

  res.status(200).send('ok');
}
