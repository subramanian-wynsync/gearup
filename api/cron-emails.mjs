import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND = process.env.RESEND_API_KEY;
const FROM = 'Subramanian from GearUp <subramanian@gearup.study>';
const REPLY_TO = 'subramanian@gearup.study';
const SITE = 'https://gearup.study';
const ALL = ['biw','plastics','design','fea','cfd'];
const NAMES = { biw:'Body in White', plastics:'Automotive Plastics & Glazing', design:'Cracking the Automotive Design Interview', fea:'Cracking the FEA & Simulation Interview', cfd:'The Complete CFD Engineer' };

function btn(label, href){ return `<div style="text-align:center;margin:24px 0 8px"><a href="${href}" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px">${label}</a></div>`; }
function wrap(inner){ return `<div style="background:#080d18;padding:32px 0;font-family:Arial,Helvetica,sans-serif"><div style="max-width:520px;margin:0 auto;background:#0c1424;border:1px solid #22304a;border-radius:18px;overflow:hidden"><div style="padding:26px 28px 4px"><div style="font-weight:800;font-size:22px;color:#eaf1ff">Gear<span style="color:#C88A4B">Up</span></div></div><div style="padding:4px 28px 6px;color:#c3d1e8;font-size:15px;line-height:1.65">${inner}</div><div style="padding:16px 28px 24px;border-top:1px solid #22304a;color:#6f83a6;font-size:12px">GearUp Press · gearup.study · reply anytime, it reaches me</div></div></div>`; }
const H = t => `<h1 style="font-size:21px;color:#fff;margin:16px 0 10px">${t}</h1>`;

const SEQ = [
  { key:'d2', day:2, window:5, subject:'Have you opened your first book yet? 🔧',
    skip:()=>false,
    build:()=> H('Have you opened your books yet?')+
      `<p>Hey — it's been a couple of days since you picked up your GearUp books, and I wanted to make sure you got in okay.</p>
       <p>If you haven't started, here's the easiest way in: log in, open any book, and try the practice quiz at the end of a chapter — the mechanic keeps you company, and it's a surprisingly good way to find your level.</p>`+
      btn('Open my books →', SITE+'/login.html')+
      `<p style="color:#9fb2d4;font-size:13px">Stuck on anything at all? Just reply.</p>` },
  { key:'d7', day:7, window:6, subject:"One week in — how are the books treating you? 📘",
    skip:()=>false,
    build:()=> H("One week in — how's it going?")+
      `<p>You've had the books about a week now, and I'd genuinely love to know how you're finding them — what's clicking, and what's missing.</p>
       <p>If they're helping, a short review or even a one-line reply means a lot and helps other engineers find them. And if something isn't landing, tell me — I read every reply and use them to make the books better.</p>`+
      btn('Keep reading →', SITE+'/login.html') },
  { key:'d14', day:14, window:7, subject:"Complete your GearUp set — reader's discount inside",
    skip:(ctx)=> ctx.missing.length===0,
    build:(ctx)=> H('Ready to complete your set?')+
      `<p>Since you've been working through your GearUp books, I thought you might want the ones you don't have yet:</p>
       <ul style="color:#dbe5f5;padding-left:20px">${ctx.missing.map(b=>`<li style="margin:5px 0">${NAMES[b]}</li>`).join('')}</ul>
       <p>As a reader, there's a discount waiting in your dashboard the moment you add another — and the more you add, the bigger it gets.</p>`+
      btn('See the other books →', SITE) },
  { key:'d30', day:30, window:12, subject:'A month with GearUp — a favour and a tip 🔧',
    skip:()=>false,
    build:()=> H('A month with GearUp 🔧')+
      `<p>It's been about a month. If the books helped you prep — or land something — I'd love to hear the story. Just hit reply.</p>
       <p>And if you know another engineer grinding through interviews, forwarding this along would genuinely mean the world. That's how GearUp grows.</p>`+
      btn('Back to your books →', SITE+'/login.html') },
];

async function send(to, subject, html){
  if(!RESEND) return false;
  try{ const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{'Authorization':'Bearer '+RESEND,'Content-Type':'application/json'}, body:JSON.stringify({from:FROM,to:[to],reply_to:REPLY_TO,subject,html}) });
    return r.ok; }catch(e){ console.error('send',e); return false; }
}

export default async function handler(req, res){
  if(process.env.CRON_SECRET && req.headers.authorization !== 'Bearer '+process.env.CRON_SECRET) return res.status(401).send('unauthorized');
  const now=Date.now();
  let users=[], page=1;
  while(page<=20){ const { data, error } = await supabase.auth.admin.listUsers({ page, perPage:1000 }); if(error||!data?.users?.length) break; users.push(...data.users); if(data.users.length<1000) break; page++; }
  let sent=0, checked=0;
  for(const u of users){
    const days=(now-new Date(u.created_at).getTime())/86400000;
    const step=SEQ.find(s=> days>=s.day && days<s.day+s.window);
    if(!step) continue;
    const { data:log } = await supabase.from('email_log').select('id').eq('user_id',u.id).eq('email_key',step.key).maybeSingle();
    if(log) continue;
    const { data:pur } = await supabase.from('purchases').select('book_id').eq('user_id',u.id);
    const owned=[...new Set((pur||[]).map(r=>r.book_id))].filter(b=>ALL.includes(b));
    if(!owned.length) continue;
    const missing=ALL.filter(b=>!owned.includes(b));
    const ctx={ owned, missing };
    if(step.skip(ctx)){ await supabase.from('email_log').insert({user_id:u.id,email_key:step.key}); continue; }
    checked++;
    const ok=await send(u.email, step.subject, wrap(step.build(ctx)));
    if(ok){ await supabase.from('email_log').insert({user_id:u.id,email_key:step.key}); sent++; }
  }
  res.status(200).json({ ok:true, users:users.length, sent, checked });
}
