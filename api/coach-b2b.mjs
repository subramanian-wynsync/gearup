// GearUp Interview Coach, B2B (colleges) + waitlist endpoint.
// POST { action: ... }
//   'waitlist' { email, branch, consent }           , public: Electrical/Civil/EV coming-soon list
//   'inquiry'  { name, college, email, phone, students, message }, public: batch-pricing inquiry
//   'grant'    { key, college, emails[], months }   , ADMIN: bulk-activate student licenses
//   'report'   { key, college? }                    , ADMIN: licenses + usage this month
// Admin actions require key === process.env.B2B_ADMIN_KEY (set it in Vercel; any long
// random string you generate yourself, treat it like a password).
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND = process.env.RESEND_API_KEY;
const FROM = 'Subramanian from GearUp <subramanian@gearup.study>';
const OWNER = process.env.B2B_NOTIFY_EMAIL || 'jhsubramanian87@gmail.com';
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_GRANT = 100;

async function sendEmail(to, subject, html, replyTo){
  if(!RESEND) return;
  try{
    await fetch('https://api.resend.com/emails', { method:'POST',
      headers:{ 'Authorization':'Bearer '+RESEND, 'Content-Type':'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html, ...(replyTo?{reply_to:replyTo}:{}) }) });
  }catch(e){ console.error('resend', e); }
}

async function ensureUser(email){
  const { data: cr } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (cr?.user) return { created: true };
  return { created: false };
}

async function welcomeStudent(email, college, months){
  let setPw='';
  try{
    const { data } = await supabase.auth.admin.generateLink({ type:'recovery', email,
      options:{ redirectTo:'https://www.gearup.study/reset.html' } });
    if (data?.properties?.action_link)
      setPw='<p><a href="'+data.properties.action_link+'" style="background:#F2A900;color:#0B1526;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Set your password →</a></p>'+
            '<p style="color:#666;font-size:13px">If the button has expired, use "Forgot password" at gearup.study/login.html with this email.</p>';
  }catch(e){}
  await sendEmail(email, 'Your college gave you the GearUp Interview Coach 🔧',
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a2233">'+
    '<h2>Your placement prep just levelled up</h2>'+
    '<p><b>'+college+'</b> has activated the GearUp Interview Coach for you for <b>'+months+' month'+(months>1?'s':'')+'</b>: AI mock interviews built for mechanical &amp; automotive engineers, resume-aware questions, follow-ups, voice &amp; video practice, and feedback pointing to the exact book chapters to study.</p>'+
    setPw+
    '<p><a href="https://www.gearup.study/coach.html">Start practising → gearup.study/coach.html</a></p>'+
    '<p style="color:#666;font-size:13px">Questions? Just reply to this email. Subramanian, GearUp</p></div>');
}

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  const action = String(b.action || '');

  try {
    // ---------------- public: coming-soon waitlist ----------------
    if (action === 'waitlist'){
      const email = String(b.email || '').trim().toLowerCase();
      const branch = ['electrical','civil','ev'].includes(b.branch) ? b.branch : 'other';
      if (!EMAIL_RX.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
      if (!b.consent) return res.status(400).json({ error: 'Please tick the consent box.' });
      await supabase.from('leads').upsert(
        { email, source: 'coach-waitlist-'+branch, consent: true },
        { onConflict: 'email', ignoreDuplicates: true });
      return res.status(200).json({ ok: true });
    }

    // ---------------- public: college batch inquiry ----------------
    if (action === 'inquiry'){
      const email = String(b.email || '').trim().toLowerCase();
      const college = String(b.college || '').trim().slice(0, 120);
      const name = String(b.name || '').trim().slice(0, 80);
      const phone = String(b.phone || '').trim().slice(0, 30);
      const students = String(b.students || '').trim().slice(0, 20);
      const message = String(b.message || '').trim().slice(0, 1000);
      if (!EMAIL_RX.test(email) || !college || !name)
        return res.status(400).json({ error: 'Name, college and a valid email are required.' });
      await supabase.from('leads').upsert(
        { email, name: name+' ('+college+')', source: 'b2b-inquiry', consent: true },
        { onConflict: 'email', ignoreDuplicates: true });
      await sendEmail(OWNER, '🎓 B2B inquiry, '+college,
        '<div style="font-family:Georgia,serif;max-width:560px;color:#1a2233"><h2>Batch licensing inquiry</h2>'+
        '<p><b>Name:</b> '+name+'<br><b>College:</b> '+college+'<br><b>Email:</b> '+email+
        '<br><b>Phone:</b> '+(phone||'-')+'<br><b>Batch size:</b> '+(students||'-')+'</p>'+
        (message?'<p><b>Message:</b><br>'+message.replace(/</g,'&lt;')+'</p>':'')+
        '<p style="color:#666;font-size:13px">Reply directly to reach them.</p></div>', email);
      return res.status(200).json({ ok: true });
    }

    // ---------------- admin gate ----------------
    const KEY = process.env.B2B_ADMIN_KEY;
    if (!KEY || String(b.key || '') !== KEY)
      return res.status(401).json({ error: 'Not authorised.' });

    // ---------------- admin: one-time Coach launch announcement ----------------
    // { action:'announce', key, leads:true, customers:true, dry:true } → counts only
    // Sends at most 80 per call (Vercel time limits), click again until remaining is 0.
    if (action === 'announce'){
      const SITE = 'https://www.gearup.study';
      const sig = e => crypto.createHmac('sha256', process.env.CRON_SECRET || 'gearup').update(e).digest('hex').slice(0, 16);
      const unsub = e => `${SITE}/api/unsubscribe?e=${encodeURIComponent(e)}&s=${sig(e)}`;
      const rec = new Map();
      if (b.leads !== false){
        const { data } = await supabase.from('leads').select('email,unsubscribed').eq('unsubscribed', false).limit(5000);
        (data || []).forEach(l => l.email && rec.set(l.email.toLowerCase(), 'lead'));
      }
      if (b.customers){
        let page = 1;
        while (page <= 10){
          const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
          if (error || !data?.users?.length) break;
          data.users.forEach(u => { if (u.email) rec.set(u.email.toLowerCase(), 'customer'); });
          if (data.users.length < 1000) break;
          page++;
        }
      }
      const { data: logged } = await supabase.from('announce_log').select('email').limit(10000);
      (logged || []).forEach(r => rec.delete(r.email));
      const list = [...rec.keys()];
      if (b.dry) return res.status(200).json({ ok: true, would_send: list.length });

      const launchHtml = email => `<div style="background:#080d18;padding:32px 0;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;background:#0c1424;border:1px solid #22304a;border-radius:18px;overflow:hidden"><div style="padding:26px 28px 4px"><div style="font-weight:800;font-size:22px;color:#eaf1ff">Gear<span style="color:#C88A4B">Up</span></div></div><div style="padding:4px 28px 6px;color:#c3d1e8;font-size:15px;line-height:1.65">
        <h1 style="font-size:21px;color:#fff;margin:16px 0 10px">Your AI interviewer is ready 🎙️</h1>
        <p>Something big just went live on GearUp: an <strong style="color:#fff">AI Interview Coach</strong> built specifically for mechanical and automotive engineers, trained on 18+ years of real interview panels at Nissan, Mercedes-Benz and Scania.</p>
        <p>It calls you like a real telephonic round, interviews you face to face on video, reads your resume and asks about <em>your</em> projects, digs deeper when an answer is weak, and then coaches you: technical scores, voice and language feedback, presence tips, and the exact book chapters to fix each gap.</p>
        <p><strong style="color:#fff">Try it free right now:</strong> one telephonic question and one video question, no card and no account needed.</p>
        <div style="text-align:center;margin:24px 0 8px"><a href="${SITE}/coach.html" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px">Take the free AI interview →</a></div>
        <p>The full Coach is 50 mock interviews a month for $6.99, about 14 cents per interview. And if you have been eyeing the books, the launch offer has all five at half price, one-time payment with lifetime access.</p>
        <p style="color:#9fb2d4;font-size:13px">Questions? Just reply, it reaches me directly. Subramanian</p>
      </div><div style="padding:16px 28px 24px;border-top:1px solid #22304a;color:#6f83a6;font-size:12px">GearUp Press · gearup.study · <a href="${unsub(email)}" style="color:#6f83a6">unsubscribe</a></div></div></div>`;

      let sentN = 0;
      for (const email of list.slice(0, 80)){
        await sendEmail(email, 'Your AI interviewer is ready: free mock interview inside 🎙️', launchHtml(email));
        await supabase.from('announce_log').upsert({ email });
        sentN++;
      }
      return res.status(200).json({ ok: true, sent: sentN, remaining: Math.max(0, list.length - 80) });
    }

    // ---------------- admin: bulk grant ----------------
    if (action === 'grant'){
      const college = String(b.college || '').trim().slice(0, 80);
      const months = Math.min(Math.max(parseInt(b.months || '6', 10) || 6, 1), 24);
      const sendWelcome = b.send_welcome !== false;
      let emails = Array.isArray(b.emails) ? b.emails : String(b.emails || '').split(/[\s,;]+/);
      emails = [...new Set(emails.map(e => String(e).trim().toLowerCase()).filter(e => EMAIL_RX.test(e)))];
      if (!college) return res.status(400).json({ error: 'College / batch name is required.' });
      if (!emails.length) return res.status(400).json({ error: 'No valid email addresses found.' });
      if (emails.length > MAX_GRANT) return res.status(400).json({ error: 'Max '+MAX_GRANT+' emails per batch, paste the rest as a second batch.' });

      const until = new Date(Date.now() + months * 31 * 86400000).toISOString();
      const now = new Date().toISOString();
      const { error: upErr } = await supabase.from('coach_subscriptions').upsert(
        emails.map(email => ({ email, plan: 'coach-b2b', active_until: until, source: 'b2b:'+college, updated_at: now })),
        { onConflict: 'email' });
      if (upErr) { console.error('b2b upsert', upErr); return res.status(500).json({ error: 'Could not save licenses.' }); }

      // create accounts + welcome emails, in parallel chunks of 10
      let created = 0;
      for (let i = 0; i < emails.length; i += 10){
        await Promise.allSettled(emails.slice(i, i + 10).map(async email => {
          const r = await ensureUser(email);
          if (r.created) created++;
          if (sendWelcome) await welcomeStudent(email, college, months);
        }));
      }
      return res.status(200).json({ ok: true, granted: emails.length, new_accounts: created, active_until: until });
    }

    // ---------------- admin: usage report ----------------
    if (action === 'report'){
      const college = String(b.college || '').trim();
      let q = supabase.from('coach_subscriptions')
        .select('email, plan, active_until, source')
        .like('source', college ? 'b2b:'+college+'%' : 'b2b:%')
        .order('source').limit(1000);
      const { data: subs, error } = await q;
      if (error) return res.status(500).json({ error: 'Could not load report.' });
      const month = new Date().toISOString().slice(0, 7);
      const { data: usage } = await supabase.from('coach_usage')
        .select('email, interviews, video').eq('month', month)
        .in('email', (subs || []).map(s => s.email).slice(0, 1000));
      const umap = {}; (usage || []).forEach(u => umap[u.email] = u);
      const rows = (subs || []).map(s => ({
        email: s.email,
        batch: s.source.replace(/^b2b:/, ''),
        active_until: s.active_until,
        active: s.active_until && new Date(s.active_until) > new Date(),
        interviews_this_month: umap[s.email]?.interviews || 0,
        video_this_month: umap[s.email]?.video || 0,
      }));
      const batches = {};
      rows.forEach(r => {
        batches[r.batch] = batches[r.batch] || { students: 0, active: 0, interviews: 0, practising: 0 };
        batches[r.batch].students++;
        if (r.active) batches[r.batch].active++;
        batches[r.batch].interviews += r.interviews_this_month;
        if (r.interviews_this_month > 0) batches[r.batch].practising++;
      });
      return res.status(200).json({ ok: true, month, batches, rows });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('coach-b2b', e);
    return res.status(500).json({ error: 'Something went wrong, please try again.' });
  }
}
