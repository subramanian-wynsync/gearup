// GearUp — lead magnet: store the lead and send the free starter pack.
// POST { email, name? }  → upserts into `leads`, emails the Top-20 Q&A pack via Resend.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND = process.env.RESEND_API_KEY;
const FROM = 'Subramanian from GearUp <subramanian@gearup.study>';
const REPLY_TO = 'subramanian@gearup.study';
const SITE = 'https://www.gearup.study';

const sig = e => crypto.createHmac('sha256', process.env.CRON_SECRET || 'gearup')
  .update(e).digest('hex').slice(0, 16);

const QA = {
  'Design and mechanical fundamentals': [
    ['What is the difference between stress and strain?',
     'Stress is the internal force per unit area inside a loaded part (N/mm2). Strain is the deformation that results, per unit length, so it has no unit. Stress causes strain, and the slope of the elastic part of the curve is Young’s modulus.'],
    ['Why do we use a factor of safety, and how do you choose it?',
     'It covers what you cannot know exactly: real loads, material scatter, manufacturing variation. You choose it from standards, from the consequence of failure, and from material behaviour. Brittle or fatigue-critical parts get bigger factors than ductile, well-understood ones.'],
    ['What is GD&T, and why not just put a tolerance on every dimension?',
     'GD&T tolerances what the part must do: form, orientation and location relative to datums, so parts still assemble and function as dimensions vary. Plain plus-minus tolerancing over-constrains some features and misses others.'],
    ['How do you design differently for ductile versus brittle failure?',
     'Ductile materials yield first and redistribute load, so you design against yield with a margin. Brittle materials fail suddenly from small flaws, so you design against ultimate strength, use larger factors, and avoid sharp stress concentrations.']],
  'Body in White': [
    ['What exactly is Body in White?',
     'The welded sheet-metal body structure before paint, closures, trim and powertrain are added. It decides the car’s stiffness, crash performance and dimensional quality, which is why so many interview questions start here.'],
    ['Monocoque versus body-on-frame: when and why?',
     'In a monocoque the skin and the structure are one welded shell: lighter, stiffer, standard for passenger cars. Body-on-frame keeps a separate ladder chassis: rugged and easy to make variants from, which is why trucks still use it.'],
    ['Why is spot welding the standard joining method for BIW?',
     'It is fast, cheap, easy to automate and needs no filler, and it suits thin overlapped sheets. A typical body carries thousands of spot welds placed deliberately along its load paths.'],
    ['What is a crumple zone, and what is a load path?',
     'Front and rear structures are tuned to collapse progressively and absorb crash energy while the passenger cell stays rigid. Load paths are the routes that steer those crash forces around the occupants.']],
  'Automotive plastics': [
    ['Thermoplastic versus thermoset: what is the real difference?',
     'Thermoplastics such as PP, ABS and PC melt and can be re-melted, so they can be injection moulded and recycled. Thermosets such as epoxy and phenolic cure once and never re-melt, which buys heat and chemical resistance.'],
    ['Why do injection-moulded parts need uniform wall thickness?',
     'Uneven walls cool at different rates, which causes sink marks, warpage and locked-in stress. Keep walls constant and add stiffness with ribs, not with thick sections.'],
    ['What are draft angles and why do parts need them?',
     'A small taper on walls in the direction the part leaves the tool, so it releases without sticking or scuffing. One to three degrees is typical, and textured surfaces need more.'],
    ['Name the common injection moulding defects and their causes.',
     'Sink marks, weld lines, short shots, flash, warpage and voids. Each traces back to wall sections, gate position, pressure, temperature or venting, and an interviewer wants you to make that connection.']],
  'FEA and simulation': [
    ['Explain FEA in two sentences, and why the mesh matters.',
     'You divide a structure into small elements and solve the equilibrium equations across all of them to approximate stress and deflection. The mesh controls accuracy: refine where gradients are high, keep it coarse elsewhere, and show your result converges.'],
    ['Linear versus nonlinear analysis: where is the line?',
     'Linear assumes small deflections, elastic material and unchanging contact, so response scales with load. The moment you have plasticity, large deformation or contact that opens and closes, you are nonlinear: crash, snap-fits, seals.'],
    ['Why are boundary conditions so critical?',
     'They represent how the part is really held and loaded. A perfect mesh with wrong constraints gives you a confident wrong answer, and over-constraining makes the model artificially stiff.'],
    ['Stress concentration versus stress singularity?',
     'A concentration is a real local rise at a radius or hole. A singularity is a modelling artifact at a sharp corner or point load, where stress keeps climbing as you refine the mesh. Judge by the geometry, not by one node’s number.']],
  'CFD': [
    ['What equations does CFD actually solve?',
     'Conservation of mass, momentum (the Navier-Stokes equations) and energy, discretised over a mesh and solved iteratively until the solution stops changing.'],
    ['What does Reynolds number tell you about a flow?',
     'It compares inertial to viscous forces. Low Re flows are smooth and layered, high Re flows are chaotic and mixing, and almost every vehicle flow is turbulent, which is why we model turbulence instead of resolving it.'],
    ['What is y+ and why do you check it?',
     'The non-dimensional distance of the first cell from a wall. It must match the wall treatment of your turbulence model, otherwise friction and heat transfer at the wall are simply wrong.'],
    ['How do you know a CFD result is trustworthy?',
     'Residuals drop and flatten, the quantities you monitor stop changing, mass balances in and out, the result is mesh-independent, and finally you compare against test data or known results.']],
};

function packHTML(unsubUrl){
  let body = `<h1 style="font-size:22px;color:#fff;margin:14px 0 8px">Your starter pack: the 20 questions that keep coming up</h1>
  <p>Thanks for grabbing this. These are the questions I have seen asked again and again across design, body, plastics, FEA and CFD interviews, with the short answers that show an interviewer you understand the idea. Use them as a checklist: if you can explain each one out loud, you are ready to go deeper.</p>`;
  for (const [topic, list] of Object.entries(QA)){
    body += `<h2 style="font-size:16px;color:#e0a668;margin:22px 0 6px">${topic}</h2>`;
    list.forEach(([q, a], i) => {
      body += `<p style="margin:10px 0 2px"><b style="color:#fff">${q}</b></p><p style="margin:0 0 8px;color:#c3d1e8">${a}</p>`;
    });
  }
  body += `<h2 style="font-size:16px;color:#e0a668;margin:26px 0 6px">Your free demo access</h2>
  <p>Reading answers is one thing. The GearUp books are interactive: quizzes that score you as you read, a mechanic who reacts to your answers, progress that saves. Try the real reader now, no login needed:</p>
  <div style="text-align:center;margin:18px 0 6px"><a href="${SITE}/demo.html" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px">Open the free demos →</a></div>`;
  body += `<p style="margin-top:22px">Every one of these has a full chapter behind it in the GearUp books, with worked examples, figures and 4,000+ interview questions across the five volumes. You can try a live preview free on the site.</p>
  <div style="text-align:center;margin:24px 0 8px"><a href="${SITE}" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px">Explore the 5 books →</a></div>
  <p style="color:#9fb2d4;font-size:13px">Questions about anything here? Just hit reply, it comes straight to me.</p>`;
  return `<div style="background:#080d18;padding:32px 0;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;background:#0c1424;border:1px solid #22304a;border-radius:18px;overflow:hidden"><div style="padding:26px 28px 4px"><div style="font-weight:800;font-size:22px;color:#eaf1ff">Gear<span style="color:#C88A4B">Up</span></div></div><div style="padding:4px 28px 6px;color:#c3d1e8;font-size:15px;line-height:1.65">${body}</div><div style="padding:16px 28px 24px;border-top:1px solid #22304a;color:#6f83a6;font-size:12px">GearUp Press · gearup.study · <a href="${unsubUrl}" style="color:#6f83a6">unsubscribe</a></div></div></div>`;
}

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let { email, name } = req.body || {};
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    name = String(name || '').trim().slice(0, 80) || null;

    const { error } = await supabase.from('leads')
      .upsert({ email, name, source: 'starter-pack', consent: true }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) console.error('leads upsert', error);

    if (RESEND) {
      const unsubUrl = `${SITE}/api/unsubscribe?e=${encodeURIComponent(email)}&s=${sig(email)}`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [email], reply_to: REPLY_TO,
          subject: 'Your free pack: the 20 most-asked engineering interview questions 🔧',
          html: packHTML(unsubUrl) })
      });
      if (!r.ok) console.error('resend', await r.text());
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('subscribe', e);
    return res.status(500).json({ error: 'Something went wrong, please try again.' });
  }
}
