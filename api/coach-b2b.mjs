// GearUp — "coming soon" waitlist (Electrical & Embedded, EV, Civil i-Books).
// POST { action:'waitlist', email, branch, consent }
// (File name kept so existing links keep working; the old Interview Coach college features were removed —
//  the AI interview product now lives at https://wynsync.tech/education/wynrise)
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
        { email, source: 'waitlist-'+branch, consent: true },
        { onConflict: 'email', ignoreDuplicates: true });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('waitlist', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
