// GearUp — free reader account (lead capture).
// POST { name, email, department, password, consent }
// Creates a confirmed Supabase login, saves the lead, sends the welcome email.
// The browser then signs in with the same password.
import { createClient } from '@supabase/supabase-js';
import { send, wrap, btn, H, esc, SITE, NAMES, findUserByEmail } from './mail.mjs';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const DEPARTMENTS = ['Mechanical','Automobile / Automotive','Production / Manufacturing','Aerospace','Mechatronics','Electrical','Electronics & Embedded','Civil','Other'];

function welcome(name){
  const books = ['biw','plastics','design','fea','cfd'].map(id =>
    `<li style="margin:6px 0"><a href="${SITE}/reader.html?book=${id}" style="color:#e0a668;text-decoration:none">${NAMES[id]}</a></li>`).join('');
  return H(`Welcome to GearUp, ${esc(name)} 🔧`) +
    `<p>Your free reader account is ready. You can read <b style="color:#fff">the first 2 chapters of every GearUp i-Book</b>, with the real figures, interview Q&amp;A and chapter quizzes:</p>
     <ul style="color:#dbe5f5;padding-left:20px">${books}</ul>` +
    btn('Start reading →', SITE + '/portal.html') +
    `<p>When you're ready for the full book, the more you add the more you save: 2 books 10% off, 3 books 15%, 4 books 20%, and all 5 at 30% off.</p>
     <p style="color:#9fb2d4;font-size:13px">Log in any time at gearup.study with the email and password you just chose.</p>`;
}

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 80);
    const email = String(b.email || '').trim().toLowerCase();
    let department = String(b.department || '').trim().slice(0, 60);
    const password = String(b.password || '');
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
    if (!EMAIL_RX.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!department) return res.status(400).json({ error: 'Please choose your department.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!b.consent) return res.status(400).json({ error: 'Please accept the terms to create your account.' });

    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name, department, source: 'register' },
    });
    if (error || !data?.user) {
      const existing = await findUserByEmail(supabase, email);
      if (existing) return res.status(409).json({ error: 'An account with this email already exists. Please sign in (or use "Forgot password").', code: 'exists' });
      console.error('register createUser', error);
      return res.status(500).json({ error: 'Could not create your account. Please try again.' });
    }
    const uid = data.user.id;
    try { await supabase.from('profiles').upsert({ user_id: uid, name, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); } catch (e) { console.error('profile', e); }
    try { await supabase.from('leads').upsert({ email, name, source: 'register', consent: true, unsubscribed: false }, { onConflict: 'email' }); } catch (e) { console.error('lead', e); }
    const ok = await send(email, 'Your 2 free chapters are unlocked 🔧', wrap(welcome(name), email));
    if (ok) { try { await supabase.from('email_log').insert({ user_id: uid, email_key: 'r0' }); } catch {} }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('register', e);
    return res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }
}
