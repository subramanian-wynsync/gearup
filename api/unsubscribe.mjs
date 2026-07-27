// GearUp — one-click unsubscribe for the leads list.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sig = e => crypto.createHmac('sha256', process.env.CRON_SECRET || 'gearup')
  .update(e).digest('hex').slice(0, 16);

export default async function handler(req, res){
  const email = String(req.query.e || '').trim().toLowerCase();
  const s = String(req.query.s || '');
  const page = (msg) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GearUp</title></head>
  <body style="margin:0;background:#080d18;color:#eaf1ff;font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">
  <div style="background:#0c1424;border:1px solid #22304a;border-radius:18px;padding:34px;max-width:420px;text-align:center">
  <div style="font-weight:800;font-size:22px;margin-bottom:12px">Gear<span style="color:#C88A4B">Up</span></div>
  <p style="color:#c3d1e8;font-size:15px;line-height:1.6">${msg}</p>
  <p style="margin-top:18px"><a href="https://www.gearup.study" style="color:#e0a668">Back to gearup.study</a></p></div></body></html>`;

  if (!email || s !== sig(email)) return res.status(400).send(page('That unsubscribe link looks invalid or expired. If you want off the list, just reply to any of our emails and say so.'));
  try {
    await supabase.from('leads').update({ unsubscribed: true }).eq('email', email);
    return res.status(200).send(page('Done. You are unsubscribed and will not receive any more emails from this list. Your account and any purchased books are unaffected.'));
  } catch (e) {
    return res.status(500).send(page('Something went wrong. Reply to any of our emails and we will remove you manually.'));
  }
}
