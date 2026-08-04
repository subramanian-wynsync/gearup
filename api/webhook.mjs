// GearUp — Stripe webhook. Handles BOTH:
//   1) Book purchases (checkout.session.completed → purchases table)   [unchanged]
//   2) Interview Coach subscriptions (metadata gearup_coach:'1')
//      - checkout.session.completed → activate coach_subscriptions + create account + welcome email
//      - invoice.paid                → extend active_until on each monthly renewal
//      - customer.subscription.deleted → let access lapse
// In Stripe dashboard the webhook must be subscribed to those three event types.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const WHSEC=process.env.STRIPE_WEBHOOK_SECRET;
const supabase=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND=process.env.RESEND_API_KEY;
const FROM='Subramanian from GearUp <subramanian@gearup.study>';
const BOOKS=['biw','plastics','design','fea','cfd'];
const GRACE_DAYS=3; // renewal grace so a slow invoice never locks a paying user out

function mapName(n){ n=(n||'').toLowerCase();
  if(/all 5|all five|bundle/.test(n)) return 'bundle';
  if(/body in white/.test(n)) return 'biw';
  if(/plastic|glazing/.test(n)) return 'plastics';
  if(/fea|simulation/.test(n)) return 'fea';
  if(/cfd/.test(n)) return 'cfd';
  if(/design/.test(n)) return 'design';
  return null; }

async function ensureUser(email){
  let uid=null; const {data:cr}=await supabase.auth.admin.createUser({email,email_confirm:true});
  if(cr?.user) return {uid:cr.user.id, created:true};
  const {data:l}=await supabase.auth.admin.listUsers();
  uid=l?.users?.find(u=>u.email?.toLowerCase()===email)?.id||null;
  return {uid, created:false};
}

async function sendEmail(to, subject, html){
  if(!RESEND) return;
  try{
    await fetch('https://api.resend.com/emails',{method:'POST',
      headers:{'Authorization':'Bearer '+RESEND,'Content-Type':'application/json'},
      body:JSON.stringify({from:FROM,to,subject,html})});
  }catch(e){ console.error('resend',e); }
}

async function activateCoach(email, until, source){
  await supabase.from('coach_subscriptions').upsert(
    { email, plan:'coach-monthly', active_until: until.toISOString(), source, updated_at: new Date().toISOString() },
    { onConflict:'email' });
}

async function coachWelcome(email, created){
  let setPw='';
  if(created){
    try{
      const {data}=await supabase.auth.admin.generateLink({type:'recovery', email,
        options:{ redirectTo:'https://www.gearup.study/reset.html' }});
      if(data?.properties?.action_link)
        setPw='<p><a href="'+data.properties.action_link+'" style="background:#F2A900;color:#0B1526;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Set your password →</a></p>'+
              '<p style="color:#666;font-size:13px">That button creates your GearUp login (it expires after a while — if it does, just use "Forgot password" on the login page).</p>';
    }catch(e){ console.error('genlink',e); }
  }
  await sendEmail(email,'Your GearUp Interview Coach is live 🔧',
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a2233">'+
    '<h2>Welcome to the Interview Coach</h2>'+
    '<p>Your subscription is active: <b>50 mock interviews a month</b> (8 with video), resume-aware questions, follow-ups on weak answers, and feedback that points you to the exact book chapters to study.</p>'+
    setPw+
    '<p><a href="https://www.gearup.study/coach.html">Start an interview → gearup.study/coach.html</a></p>'+
    '<p>Tip: paste a few lines about your projects in the résumé box — the interviewer will dig into them, exactly like a real panel does.</p>'+
    '<p style="color:#666;font-size:13px">Manage or cancel anytime — just reply to this email and I will sort it out. — Subramanian</p></div>');
}

export const config={api:{bodyParser:false}};
export default async function handler(req,res){
  const ch=[]; for await(const c of req) ch.push(c); const raw=Buffer.concat(ch);
  let ev; try{ ev=stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], WHSEC); }
  catch(e){ return res.status(400).send('bad signature: '+e.message); }

  try{
    // ---------- checkout completed: books OR coach ----------
    if(ev.type==='checkout.session.completed'){
      const s=ev.data.object;
      const email=(s.customer_details?.email||s.customer_email||'').toLowerCase();

      if(s.metadata?.gearup_coach==='1'){
        if(email){
          const until=new Date(Date.now()+(31+GRACE_DAYS)*86400000);
          await activateCoach(email, until, 'stripe:'+(s.subscription||s.id));
          const {created}=await ensureUser(email);
          await coachWelcome(email, created);
          console.log('coach activated', email);
        }
      } else {
        let items=[];
        if(s.metadata?.gearup_items){ items=s.metadata.gearup_items.split(',').filter(Boolean); }
        else { try{ const li=await stripe.checkout.sessions.listLineItems(s.id,{expand:['data.price.product'],limit:20});
          for(const l of li.data){ const id=mapName(l.price?.product?.name||l.description); if(id&&!items.includes(id)) items.push(id); }
        }catch(e){ console.error('lineitems',e); } }
        if(items.includes('bundle')) items=BOOKS;
        if(email && items.length){
          const {uid}=await ensureUser(email);
          if(uid) await supabase.from('purchases').upsert(items.map(b=>({user_id:uid,email,book_id:b})),{onConflict:'user_id,book_id'});
          console.log('provisioned', email, items);
        }
      }
    }

    // ---------- monthly renewal: extend coach access ----------
    if(ev.type==='invoice.paid'){
      const inv=ev.data.object;
      const subId=inv.subscription;
      if(subId){
        try{
          const sub=await stripe.subscriptions.retrieve(subId);
          if(sub?.metadata?.gearup_coach==='1'){
            const email=(inv.customer_email||sub.metadata.email||'').toLowerCase();
            if(email){
              const end=sub.current_period_end ? new Date(sub.current_period_end*1000) : new Date(Date.now()+31*86400000);
              const until=new Date(end.getTime()+GRACE_DAYS*86400000);
              await activateCoach(email, until, 'stripe:'+subId);
              console.log('coach renewed', email, until.toISOString());
            }
          }
        }catch(e){ console.error('invoice.paid',e); }
      }
    }

    // ---------- cancellation: access simply lapses at active_until ----------
    if(ev.type==='customer.subscription.deleted'){
      const sub=ev.data.object;
      if(sub?.metadata?.gearup_coach==='1'){
        console.log('coach subscription ended', sub.id); // no action: active_until expires on its own
      }
    }
  }catch(e){ console.error('webhook handler', e); }

  res.status(200).send('ok');
}
