// Shared email helpers (Resend) for GearUp.
import crypto from 'node:crypto';
export const FROM = 'Subramanian from GearUp <subramanian@gearup.study>';
export const REPLY_TO = 'subramanian@gearup.study';
export const SITE = 'https://www.gearup.study';
export const NAMES = { biw:'Body in White', plastics:'Automotive Plastics & Glazing', design:'Cracking the Automotive Design Interview', fea:'Cracking the FEA & Simulation Interview', cfd:'The Complete CFD Engineer' };
export const sig = e => crypto.createHmac('sha256', process.env.CRON_SECRET || 'gearup').update(e).digest('hex').slice(0, 16);
export const unsubUrl = e => `${SITE}/api/unsubscribe?e=${encodeURIComponent(e)}&s=${sig(e)}`;
export const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function btn(label, href){ return `<div style="text-align:center;margin:24px 0 8px"><a href="${href}" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px">${label}</a></div>`; }
export const H = t => `<h1 style="font-size:21px;color:#fff;margin:16px 0 10px">${t}</h1>`;
export function wrap(inner, email){
  const foot = email ? ` · <a href="${unsubUrl(email)}" style="color:#6f83a6">unsubscribe from tips &amp; offers</a>` : '';
  return `<div style="background:#080d18;padding:32px 0;font-family:Arial,Helvetica,sans-serif"><div style="max-width:540px;margin:0 auto;background:#0c1424;border:1px solid #22304a;border-radius:18px;overflow:hidden"><div style="padding:26px 28px 4px"><div style="font-weight:800;font-size:22px;color:#eaf1ff">Gear<span style="color:#C88A4B">Up</span></div></div><div style="padding:4px 28px 6px;color:#c3d1e8;font-size:15px;line-height:1.65">${inner}</div><div style="padding:16px 28px 24px;border-top:1px solid #22304a;color:#6f83a6;font-size:12px">GearUp Press · gearup.study · reply anytime, it reaches me${foot}</div></div></div>`;
}
export async function send(to, subject, html){
  const KEY = process.env.RESEND_API_KEY;
  if (!KEY) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method:'POST',
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }) });
    if (!r.ok) console.error('resend', r.status, await r.text());
    return r.ok;
  } catch (e) { console.error('send', e); return false; }
}
// Find an auth user by email (paged, so it keeps working past 50 users).
export async function findUserByEmail(supabase, email){
  email = String(email || '').toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const u = data.users.find(x => (x.email || '').toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 1000) return null;
  }
  return null;
}
