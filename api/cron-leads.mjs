// GearUp — lead nurture: follows up with starter-pack subscribers who have not bought yet.
// Day 2: point them at the live preview. Day 6: the full value pitch.
// Runs daily via Vercel Cron. Buyers are skipped automatically (they get the customer drip instead).
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND = process.env.RESEND_API_KEY;
const FROM = 'Subramanian from GearUp <subramanian@gearup.study>';
const REPLY_TO = 'subramanian@gearup.study';
const SITE = 'https://www.gearup.study';

const sig = e => crypto.createHmac('sha256', process.env.CRON_SECRET || 'gearup')
  .update(e).digest('hex').slice(0, 16);
const unsub = e => `${SITE}/api/unsubscribe?e=${encodeURIComponent(e)}&s=${sig(e)}`;

function btn(label, href){ return `<div style="text-align:center;margin:24px 0 8px"><a href="${href}" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px">${label}</a></div>`; }
function wrap(inner, email){ return `<div style="background:#080d18;padding:32px 0;font-family:Arial,Helvetica,sans-serif"><div style="max-width:540px;margin:0 auto;background:#0c1424;border:1px solid #22304a;border-radius:18px;overflow:hidden"><div style="padding:26px 28px 4px"><div style="font-weight:800;font-size:22px;color:#eaf1ff">Gear<span style="color:#C88A4B">Up</span></div></div><div style="padding:4px 28px 6px;color:#c3d1e8;font-size:15px;line-height:1.65">${inner}</div><div style="padding:16px 28px 24px;border-top:1px solid #22304a;color:#6f83a6;font-size:12px">GearUp Press · gearup.study · reply anytime, it reaches me · <a href="${unsub(email)}" style="color:#6f83a6">unsubscribe</a></div></div></div>`; }
const H = t => `<h1 style="font-size:21px;color:#fff;margin:16px 0 10px">${t}</h1>`;

const STEPS = [
  { flag: 'd2_sent', day: 2, maxDay: 7,
    subject: 'Did the 20 questions help? Here is the next step 🔧',
    build: () => H('How did the 20 questions land?') +
      `<p>A couple of days ago you grabbed my starter pack. If you worked through it, you already know the pattern: interviewers do not want definitions, they want to hear that you understand the idea behind them.</p>
       <p>That is exactly how I wrote the GearUp books. Each of those 20 questions has a full chapter behind it, with figures, worked examples and practice quizzes that keep score as you read. You can open the free demo right now, no login and no payment: read the first topics in the real reader, take the quiz, and watch the mechanic react.</p>` +
      btn('Open the free demos →', SITE + '/demo.html') +
      `<p style="color:#9fb2d4;font-size:13px">Stuck on one of the 20? Reply with the question and I will answer it personally.</p>` },
  { flag: 'd6_sent', day: 6, maxDay: 14,
    subject: 'From 20 questions to 4,000: how readers prepare with GearUp 📘',
    build: () => H('From 20 questions to 4,000') +
      `<p>The starter pack gave you 20 questions. The full GearUp library has more than 4,000, spread across five interactive books and 129 chapters: automotive design, Body in White, plastics and glazing, FEA and CFD.</p>
       <p>They are not theory collections. I wrote them from 18 years as a design, development and supplier quality engineer with Nissan, Mercedes-Benz and Scania, and they read like a game: chapter quizzes, progress tracking, and a mechanic who keeps you company while you study.</p>
       <p>You can start with one book, and the discount grows as you add more. The complete set of five is $79 with lifetime access, on any device.</p>` +
      btn('Explore the 5 books →', SITE) +
      `<p style="color:#9fb2d4;font-size:13px">Not sure which book fits your target role? Reply and tell me the role, I will point you to the right one.</p>` },
];

async function send(to, subject, html){
  if (!RESEND) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }) });
    if (!r.ok) console.error('resend', await r.text());
    return r.ok;
  } catch (e) { console.error('send', e); return false; }
}

export default async function handler(req, res){
  if (process.env.CRON_SECRET && req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET)
    return res.status(401).send('unauthorized');

  // Emails of existing customers — leads who bought move to the customer drip and are skipped here.
  const customers = new Set();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    data.users.forEach(u => u.email && customers.add(u.email.toLowerCase()));
    if (data.users.length < 1000) break;
    page++;
  }

  const { data: leads, error } = await supabase.from('leads')
    .select('email,created_at,unsubscribed,d2_sent,d6_sent').eq('unsubscribed', false);
  if (error) return res.status(500).json({ error: error.message });

  const now = Date.now();
  let sent = 0, skippedCustomers = 0;
  for (const l of (leads || [])) {
    const email = (l.email || '').toLowerCase();
    if (customers.has(email)) { skippedCustomers++; continue; }
    const days = (now - new Date(l.created_at).getTime()) / 86400000;
    for (const step of STEPS) {
      if (l[step.flag]) continue;
      if (days < step.day || days >= step.maxDay) continue;
      const ok = await send(email, step.subject, wrap(step.build(), email));
      if (ok) {
        await supabase.from('leads').update({ [step.flag]: true }).eq('email', l.email);
        sent++;
      }
      break; // at most one email per lead per day
    }
  }
  return res.status(200).json({ ok: true, leads: (leads || []).length, sent, skippedCustomers });
}
