import { createClient } from '@supabase/supabase-js';
import { unsubUrl } from './_lib/mail.mjs';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND = process.env.RESEND_API_KEY;
const FROM = 'Subramanian from GearUp <subramanian@gearup.study>';
const REPLY_TO = 'subramanian@gearup.study';
const SITE = 'https://gearup.study';
const ALL = ['biw','plastics','design','fea','cfd'];
const NAMES = { biw:'Body in White', plastics:'Automotive Plastics & Glazing', design:'Cracking the Automotive Design Interview', fea:'Cracking the FEA & Simulation Interview', cfd:'The Complete CFD Engineer' };

function btn(label, href){ return `<div style="text-align:center;margin:24px 0 8px"><a href="${href}" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px">${label}</a></div>`; }
function wrap(inner, email){ return `<div style="background:#080d18;padding:32px 0;font-family:Arial,Helvetica,sans-serif"><div style="max-width:520px;margin:0 auto;background:#0c1424;border:1px solid #22304a;border-radius:18px;overflow:hidden"><div style="padding:26px 28px 4px"><div style="font-weight:800;font-size:22px;color:#eaf1ff">Gear<span style="color:#C88A4B">Up</span></div></div><div style="padding:4px 28px 6px;color:#c3d1e8;font-size:15px;line-height:1.65">${inner}</div><div style="padding:16px 28px 24px;border-top:1px solid #22304a;color:#6f83a6;font-size:12px">GearUp Press · gearup.study · reply anytime, it reaches me${email?` · <a href="${unsubUrl(email)}" style="color:#6f83a6">unsubscribe</a>`:''}</div></div></div>`; }
const H = t => `<h1 style="font-size:21px;color:#fff;margin:16px 0 10px">${t}</h1>`;

const SEQ = [
  { key:'d2', day:2, window:5, subject:'Have you opened your first book yet? 🔧',
    skip:()=>false,
    build:()=> H('Have you opened your books yet?')+
      `<p>Hey! It's been a couple of days since you picked up your GearUp books, and I wanted to make sure you got in okay.</p>
       <p>If you haven't started, here's the easiest way in: log in, open any book, and try the practice quiz at the end of a chapter. The mechanic keeps you company, and it's a surprisingly good way to find your level.</p>`+
      btn('Open my books →', SITE+'/login.html')+
      `<p style="color:#9fb2d4;font-size:13px">Stuck on anything at all? Just reply.</p>` },
  { key:'d7', day:7, window:6, subject:"How's your first week with the books going? 📘",
    skip:()=>false,
    build:()=> H("How's your first week going?")+
      `<p>You've had the books about a week now, and I'd love to know how you're finding them. What's clicking, and what's missing?</p>
       <p>If they're helping, a short review or even a one-line reply means a lot and helps other engineers find them. And if something isn't landing, tell me. I read every reply and use them to make the books better.</p>`+
      btn('Keep reading →', SITE+'/login.html') },
  { key:'d14', day:14, window:7, subject:"Complete your GearUp set (reader's discount inside)",
    skip:(ctx)=> ctx.missing.length===0,
    build:(ctx)=> H('Ready to complete your set?')+
      `<p>Since you've been working through your GearUp books, I thought you might want the ones you don't have yet:</p>
       <ul style="color:#dbe5f5;padding-left:20px">${ctx.missing.map(b=>`<li style="margin:5px 0">${NAMES[b]}</li>`).join('')}</ul>
       <p>As a reader, there's a discount waiting in your dashboard the moment you add another, and the more you add, the bigger it gets.</p>`+
      btn('See the other books →', SITE) },
  { key:'d30', day:30, window:12, subject:'A month in, and a small favour 🔧',
    skip:()=>false,
    build:()=> H('A month with GearUp 🔧')+
      `<p>It's been about a month. If the books helped you prep (or landed something!), I'd love to hear the story. Just hit reply.</p>
       <p>And if you know another engineer grinding through interviews, forwarding this along would genuinely mean the world. That's how GearUp grows.</p>`+
      btn('Back to your books →', SITE+'/login.html') },
];

// Free-reader (registered, not yet bought) sequence. Stops the moment they buy anything.
const RSEQ = [
  { key:'r1', day:1, window:3, subject:'Your 2 free chapters are waiting 📘',
    build:(ctx)=> H(`${ctx.first}, did you open your free chapters?`)+
      `<p>Your GearUp reader account unlocks the first 2 chapters of all five i-Books: real OEM figures, interview Q&amp;A and a chapter quiz at the end.</p>
       <p>A good place to start: <b style="color:#fff">${NAMES[ctx.pick]}</b>. Twenty minutes and you'll know whether it's your kind of book.</p>`+
      btn('Read my free chapters →', SITE+'/reader.html?book='+ctx.pick) },
  { key:'r3', day:3, window:4, subject:'The question interviewers ask first 🔧',
    build:(ctx)=> H('The question that opens most panels')+
      `<p>In eighteen years on both sides of the interview table, one pattern never changes: panels start with the fundamentals and push until you run out of "why".</p>
       <p>Every GearUp chapter ends with the interview Q&amp;A for exactly that. Try the Q&amp;A at the end of chapter 1 in any i-Book and see how many you can answer out loud.</p>`+
      btn('Try the chapter 1 Q&A →', SITE+'/portal.html') },
  { key:'r6', day:6, window:4, subject:'What 2,000 of my students did differently',
    build:()=> H('What my best students did differently')+
      `<p>They didn't read more. They read with a question in mind, drew the load path themselves, then checked the figure. That is how the i-Books are built: concept, figure, real case, interview Q&amp;A, quiz.</p>
       <p>If the free chapters worked for you, the full books go all the way to expert level.</p>`+
      btn('See all five i-Books →', SITE+'/#books') },
  { key:'r10', day:10, window:5, subject:'Build your library (up to 30% off)',
    build:()=> H('The more you add, the more you save')+
      `<p>Every GearUp i-Book is a one-time purchase with lifetime access and free updates. And bundles get cheaper as they grow:</p>
       <ul style="color:#dbe5f5;padding-left:20px"><li>2 books: 10% off</li><li>3 books: 15% off</li><li>4 books: 20% off</li><li><b style="color:#fff">All 5 books: 30% off</b></li></ul>`+
      btn('Pick my i-Books →', SITE+'/portal.html') },
  { key:'r15', day:15, window:7, subject:'Placement season comes quickly',
    build:()=> H('Placement season comes quickly')+
      `<p>The engineers who do well in OEM and Tier-1 interviews are rarely the ones who studied longest. They are the ones who could explain one real part end to end: its material, how it's made, how it fails, and why.</p>
       <p>That is exactly what the full chapters walk you through, one component at a time.</p>`+
      btn('Continue past chapter 2 →', SITE+'/portal.html') },
  { key:'r22', day:22, window:8, subject:'Still with me? One question 🔧',
    build:()=> H('Can I ask you one thing?')+
      `<p>You signed up for GearUp about three weeks ago. Is there something the i-Books are missing for you, a topic, a format, a price? Just hit reply and tell me. I read every answer.</p>`+
      btn('Back to my free chapters →', SITE+'/portal.html') },
];
// After the 3-week sequence: one gentle reminder a month, for 6 months, until they buy.
const MONTHLY = [
  { subject:'Your free chapters are still open 📘', build:(ctx)=> H(`Still here when you're ready, ${ctx.first}`)+
      `<p>Your GearUp reader account is active, and the first 2 chapters of every i-Book are still open for you. If exams or interviews are coming up, a chapter a day adds up fast.</p>`+btn('Open my i-Books →', SITE+'/portal.html') },
  { subject:'One component, end to end', build:()=> H('Can you explain one part end to end?')+
      `<p>Material, process, failure mode, and why. That's the answer that stands out in an OEM interview, and it's how every GearUp chapter is written. Pick one i-Book and go past chapter 2.</p>`+btn('See the i-Books →', SITE+'/#books') },
  { subject:'Save up to 30% on your GearUp library', build:()=> H('Build your library, save up to 30%')+
      `<p>2 i-Books save 10%, 3 save 15%, 4 save 20%, and all 5 save 30%. One payment, lifetime access, free updates.</p>`+btn('Pick my i-Books →', SITE+'/portal.html') },
];
const PICKS = { 'Automobile / Automotive':'biw', 'Production / Manufacturing':'plastics', 'Aerospace':'cfd', 'Mechatronics':'fea' };

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
  let unsub=new Set();
  try{ const { data:un } = await supabase.from('leads').select('email').eq('unsubscribed',true); (un||[]).forEach(r=>unsub.add((r.email||'').toLowerCase())); }catch(e){}
  for(const u of users){
    const days=(now-new Date(u.created_at).getTime())/86400000;
    const { data:pur } = await supabase.from('purchases').select('book_id').eq('user_id',u.id);
    const owned=[...new Set((pur||[]).map(r=>r.book_id))].filter(b=>ALL.includes(b));
    if(!owned.length){
      // Registered free readers who have not bought: nurture until they do.
      if(u.user_metadata?.source!=='register' || unsub.has((u.email||'').toLowerCase())) continue;
      // newest step that is due and not yet sent (at most one email per reader per day)
      let rs=null;
      for(const cand of RSEQ.filter(s=> days>=s.day && days<s.day+s.window).reverse()){
        const { data:rlog } = await supabase.from('email_log').select('id').eq('user_id',u.id).eq('email_key',cand.key).maybeSingle();
        if(!rlog){ rs=cand; break; }
      }
      if(!rs && days>=30 && days<30*7){
        const m=Math.floor(days/30); const key='m'+m;
        const { data:mlog } = await supabase.from('email_log').select('id').eq('user_id',u.id).eq('email_key',key).maybeSingle();
        if(!mlog){ const t=MONTHLY[(m-1)%MONTHLY.length]; rs={ key, subject:t.subject, build:t.build }; }
      }
      if(!rs) continue;
      checked++;
      const first=String(u.user_metadata?.name||'there').split(' ')[0];
      const ctx={ first, pick: PICKS[u.user_metadata?.department]||'biw' };
      const ok=await send(u.email, rs.subject, wrap(rs.build(ctx), u.email));
      if(ok){ await supabase.from('email_log').insert({user_id:u.id,email_key:rs.key}); sent++; }
      continue;
    }
    const step=SEQ.find(s=> days>=s.day && days<s.day+s.window);
    if(!step) continue;
    const { data:log } = await supabase.from('email_log').select('id').eq('user_id',u.id).eq('email_key',step.key).maybeSingle();
    if(log) continue;
    const missing=ALL.filter(b=>!owned.includes(b));
    const ctx={ owned, missing };
    if(step.skip(ctx)){ await supabase.from('email_log').insert({user_id:u.id,email_key:step.key}); continue; }
    checked++;
    const ok=await send(u.email, step.subject, wrap(step.build(ctx)));
    if(ok){ await supabase.from('email_log').insert({user_id:u.id,email_key:step.key}); sent++; }
  }
  res.status(200).json({ ok:true, users:users.length, sent, checked });
}
