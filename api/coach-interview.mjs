// GearUp Interview Coach — the interview engine.
// POST { action, ... } with Authorization: Bearer <supabase access token>
//   action:'start'    { skills:[], difficulty, resume_text? }  -> { session_id, question, meta, usage }
//   action:'answer'   { session_id, answer }                   -> { evaluation, done, question?, meta? }
//   action:'report'   { session_id }                           -> { report }
// Uses the user's OWN OpenAI key from env (OPENAI_API_KEY). Model: gpt-4.1-mini.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.COACH_MODEL || 'gpt-4.1-mini';
const FREE = process.env.COACH_FREE === '1';                 // testing bypass (no subscription needed)
const INTERVIEWS_PER_MONTH = parseInt(process.env.INTERVIEWS_PER_MONTH || '50', 10);
const QUESTIONS_PER_INTERVIEW = parseInt(process.env.QUESTIONS_PER_INTERVIEW || '12', 10);
const DEFAULT_QUESTIONS = 8;
const DEMO_QUESTIONS = parseInt(process.env.COACH_DEMO_QUESTIONS || '2', 10);
const VIDEO_PER_MONTH = parseInt(process.env.VIDEO_INTERVIEWS_PER_MONTH || '8', 10);
const RESEND = process.env.RESEND_API_KEY;
const FROM = 'Subramanian from GearUp <subramanian@gearup.study>';
const SITE = 'https://www.gearup.study';

const BOOK_NAMES = { fea:'Cracking the FEA & Simulation Interview', cfd:'The Complete CFD Engineer',
  design:'Cracking the Automotive Design Interview', biw:'Body in White', plastics:'Automotive Plastics & Glazing' };
const SKILL_MAP = [
  [/fea|simulation|cae|ansys|abaqus|nastran|hypermesh|stress|structural|meshing/i, 'fea'],
  [/cfd|fluid|aero|thermal|fluent|star-?ccm|openfoam|turbulen/i, 'cfd'],
  [/design|catia|solidworks|nx|creo|gd&t|gdt|drawing|tolerance/i, 'design'],
  [/biw|body|sheet ?metal|weld|stamping|closure|crash/i, 'biw'],
  [/plastic|polymer|injection|mou?ld|trim|glazing|interior|exterior/i, 'plastics'],
];

async function openai(system, user, json = false){
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.4,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  });
  if (!r.ok) throw new Error('AI request failed: ' + (await r.text()).slice(0, 200));
  return (await r.json()).choices[0].message.content.trim();
}

async function getUser(req){
  const h = req.headers.authorization || '';
  if (!h.toLowerCase().startsWith('bearer ')) return null;
  const { data } = await supabase.auth.getUser(h.slice(7).trim());
  return data?.user || null;
}

function month(){ return new Date().toISOString().slice(0, 7); }

async function retrieve(book, query){
  let q = supabase.from('coach_chunks').select('book,chapter_n,chapter_title,topic_title,content').eq('book', book).limit(2);
  const { data } = await q.textSearch('fts', query, { type: 'websearch' });
  if (data && data.length) return data;
  // fallback: any chunk from the book (keeps the interview going even on odd keywords)
  const { data: any } = await supabase.from('coach_chunks')
    .select('book,chapter_n,chapter_title,topic_title,content').eq('book', book).limit(50);
  return any && any.length ? [any[Math.floor(Math.random() * any.length)]] : [];
}

function buildPlan(books, n){
  const plan = [];
  for (let i = 0; i < n; i++) plan.push(books[i % books.length]);
  return plan;
}

async function nextQuestion(session){
  const idx = (session.qa || []).length;
  const book = session.plan[Math.min(idx, session.plan.length - 1)];
  const last = (session.qa || [])[idx - 1];

  // follow-up when the previous answer was weak, else a fresh planned question
  if (last && last.evaluation && last.evaluation.score <= 5 && !last.is_followup) {
    const q = await openai(
      'You are a senior automotive-industry technical interviewer. Ask ONE follow-up question that goes one level deeper on the same concept, guided ONLY by the supplied reference. Do not reveal answers. Return only the question.',
      `Reference:\n${last.context}\n\nPrevious question: ${last.question}\nCandidate's (weak) answer: ${last.answer}\nDifficulty: ${session.difficulty}`);
    return { question: q, meta: last.meta, context: last.context, is_followup: true };
  }
  const query = [session.skills.join(' '), session.difficulty, 'interview'].join(' ');
  const chunks = await retrieve(book, query);
  if (!chunks.length) throw new Error('No study content indexed for ' + book + '. Run the book indexer first.');
  const c = chunks[0];
  const context = `Book: ${BOOK_NAMES[c.book]}\nChapter ${c.chapter_n}: ${c.chapter_title}\nTopic: ${c.topic_title}\n${c.content}`;
  const resumeBit = session.resume_text ? `\nCandidate background (weave it in when natural): ${session.resume_text.slice(0, 800)}` : '';
  const jobBit = session.job && session.job.title ? `\nTarget role the candidate is practising for: ${session.job.title} (${session.job.seg || ''}). Role expects: ${(session.job.asks || []).slice(0,5).join('; ')}. Frame the question the way an interviewer for THIS role would.` : '';
  const q = await openai(
    `You are a senior automotive-industry technical interviewer with 18 years at OEMs. Ask ONE ${session.difficulty} interview question a fresher/junior engineer would realistically face. Use ONLY the supplied reference for the technical substance. Test understanding, not memorisation. Do not reveal the answer or mention the reference. Return only the question.`,
    `Reference:\n${context}${resumeBit}${jobBit}`);
  return { question: q, meta: { book: c.book, book_name: BOOK_NAMES[c.book], chapter_n: c.chapter_n, chapter_title: c.chapter_title, topic_title: c.topic_title }, context, is_followup: false };
}

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!OPENAI_KEY) return res.status(500).json({ error: 'Server missing OPENAI_API_KEY.' });
  const body0 = req.body || {};

  // ---------------- FREE DEMO (no login; gated by email, once per email) ----------------
  if (body0.action === 'demo_start') {
    const email = String(body0.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!body0.consent) return res.status(400).json({ error: 'Please tick the consent box.' });
    const { data: lead } = await supabase.from('leads').select('email,coach_demo_at').eq('email', email).maybeSingle();
    if (lead && lead.coach_demo_at) return res.status(403).json({ error: 'demo_used' });
    await supabase.from('leads').upsert({ email, source: 'coach-demo', consent: true, coach_demo_at: new Date().toISOString() }, { onConflict: 'email' });
    const skills = (body0.skills || []).map(x => String(x).slice(0, 60)).slice(0, 8);
    let books = [...new Set(skills.flatMap(x => SKILL_MAP.filter(([re]) => re.test(x)).map(([, b]) => b)))];
    if (!books.length) books = ['design', 'fea'];
    const session = { user_id: null, email, skills: skills.length ? skills : ['mechanical design'],
      difficulty: 'medium', plan: buildPlan(books, DEMO_QUESTIONS), resume_text: '', qa: [], status: 'demo' };
    const { data: ins, error } = await supabase.from('coach_sessions').insert(session).select('id').single();
    if (error) return res.status(500).json({ error: error.message });
    const nq = await nextQuestion(session);
    session.qa.push({ question: nq.question, meta: nq.meta, context: nq.context, is_followup: false });
    await supabase.from('coach_sessions').update({ qa: session.qa }).eq('id', ins.id);
    return res.status(200).json({ session_id: ins.id, question: nq.question, meta: nq.meta, number: 1, total: DEMO_QUESTIONS, demo: true });
  }

  if (body0.action === 'demo_answer') {
    const { data: s2 } = await supabase.from('coach_sessions').select('*').eq('id', body0.session_id).eq('status', 'demo').single();
    if (!s2) return res.status(404).json({ error: 'Demo session not found.' });
    if ((s2.qa || []).length > DEMO_QUESTIONS) return res.status(429).json({ error: 'Demo limit reached.' });
    const cur = s2.qa[s2.qa.length - 1];
    if (!cur || cur.evaluation) return res.status(400).json({ error: 'No open question.' });
    cur.answer = String(body0.answer || '').slice(0, 3000);
    const evalRaw = await openai(
      `You are an expert automotive-industry technical interviewer evaluating a candidate's spoken answer. Judge ONLY against the supplied reference. Return ONLY valid JSON:
{"score":0-10,"feedback":"2-3 sentences, constructive","strengths":[],"improvements":[],"ideal_answer":"concise model answer","language_feedback":"one sentence on grammar/clarity, kind but honest"}`,
      `Reference:\n${cur.context}\n\nQuestion: ${cur.question}\nCandidate answer: ${cur.answer}`, true);
    cur.evaluation = JSON.parse(evalRaw);
    const done = s2.qa.length >= DEMO_QUESTIONS;
    let out = { evaluation: cur.evaluation, done, number: s2.qa.length, total: DEMO_QUESTIONS, demo: true };
    if (!done) {
      const nq = await nextQuestion(s2);
      s2.qa.push({ question: nq.question, meta: nq.meta, context: nq.context, is_followup: false });
      out.question = nq.question; out.meta = nq.meta; out.number = s2.qa.length;
    } else {
      s2.status = 'demo_finished';
      const answered = s2.qa.filter(q => q.evaluation);
      out.report = {
        average_score: Math.round(answered.reduce((t, q) => t + (q.evaluation.score || 0), 0) / answered.length * 10) / 10,
        recommendations: answered.filter(q => q.meta).map(q => ({ book: q.meta.book, book_name: q.meta.book_name, chapter_n: q.meta.chapter_n, chapter_title: q.meta.chapter_title, topics: [q.meta.topic_title] })),
      };
    }
    await supabase.from('coach_sessions').update({ qa: s2.qa, status: s2.status }).eq('id', s2.id);
    return res.status(200).json(out);
  }

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in with your GearUp account first.' });
  const email = (user.email || '').toLowerCase();
  const body = req.body || {};

  try {
    // ---------------- START ----------------
    if (body.action === 'start') {
      if (!FREE) {
        const { data: sub } = await supabase.from('coach_subscriptions').select('active_until').eq('email', email).maybeSingle();
        if (!sub || new Date(sub.active_until) < new Date())
          return res.status(402).json({ error: 'subscription_required' });
      }
      const mode = ['text','voice','video'].includes(body.mode) ? body.mode : 'text';
      const { data: u } = await supabase.from('coach_usage').select('interviews,video').eq('email', email).eq('month', month()).maybeSingle();
      const used = u?.interviews || 0, vused = u?.video || 0;
      if (used >= INTERVIEWS_PER_MONTH)
        return res.status(429).json({ error: `You have used all ${INTERVIEWS_PER_MONTH} interviews this month. Your quota resets next month.` });
      if (mode === 'video' && vused >= VIDEO_PER_MONTH)
        return res.status(429).json({ error: `You have used all ${VIDEO_PER_MONTH} video interviews this month. Voice and text interviews are still available.` });
      const job = body.job && body.job.title ? { title: String(body.job.title).slice(0,120), seg: String(body.job.seg||'').slice(0,60), asks: (body.job.asks||[]).slice(0,6).map(x=>String(x).slice(0,90)) } : null;

      const skills = (body.skills || []).map(s => String(s).slice(0, 60)).slice(0, 12);
      const difficulty = ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'medium';
      // books from skills; owned books get priority (the 60/40 idea)
      let books = [...new Set(skills.flatMap(s => SKILL_MAP.filter(([re]) => re.test(s)).map(([, b]) => b)))];
      const { data: pur } = await supabase.from('purchases').select('book_id').eq('user_id', user.id);
      const owned = [...new Set((pur || []).map(r => r.book_id === 'bundle' ? ['fea','cfd','design','biw','plastics'] : [r.book_id]).flat())];
      if (!books.length) books = owned.length ? owned : ['design', 'fea'];
      const ordered = [...books.filter(b => owned.includes(b)), ...books.filter(b => !owned.includes(b))];
      const plan = buildPlan(ordered, DEFAULT_QUESTIONS);

      const session = { user_id: user.id, email, skills, difficulty, plan, mode, job,
        resume_text: String(body.resume_text || '').slice(0, 4000), qa: [], status: 'active' };
      const { data: ins, error } = await supabase.from('coach_sessions').insert(session).select('id').single();
      if (error) throw error;
      await supabase.from('coach_usage').upsert({ email, month: month(), interviews: used + 1, video: vused + (mode === 'video' ? 1 : 0) }, { onConflict: 'email,month' });

      const nq = await nextQuestion(session);
      session.qa.push({ question: nq.question, meta: nq.meta, context: nq.context, is_followup: nq.is_followup });
      await supabase.from('coach_sessions').update({ qa: session.qa }).eq('id', ins.id);
      return res.status(200).json({ session_id: ins.id, question: nq.question, meta: nq.meta,
        number: 1, total: plan.length, usage: { used: used + 1, limit: INTERVIEWS_PER_MONTH } });
    }

    // ---------------- ANSWER ----------------
    if (body.action === 'answer') {
      const { data: s } = await supabase.from('coach_sessions').select('*').eq('id', body.session_id).eq('email', email).single();
      if (!s) return res.status(404).json({ error: 'Session not found.' });
      const cur = s.qa[s.qa.length - 1];
      if (!cur || cur.evaluation) return res.status(400).json({ error: 'No open question.' });
      cur.answer = String(body.answer || '').slice(0, 4000);

      const evalRaw = await openai(
        `You are an expert automotive-industry technical interviewer evaluating a candidate's spoken answer. Judge ONLY against the supplied reference. Return ONLY valid JSON:
{"score":0-10,"feedback":"2-3 sentences, constructive","strengths":[],"improvements":[],"ideal_answer":"concise model answer","language_feedback":"one sentence on grammar/clarity/filler words, kind but honest"}`,
        `Reference:\n${cur.context}\n\nQuestion: ${cur.question}\nCandidate answer: ${cur.answer}` +
        (body.delivery && body.delivery.spoken ? `\nSpoken-delivery metrics: ~${body.delivery.wpm || '?'} words/min, ${body.delivery.fillers || 0} filler words. Reflect pace and fillers in language_feedback.` : ''), true);
      cur.evaluation = JSON.parse(evalRaw);
      if (body.delivery) cur.delivery = { wpm: body.delivery.wpm, fillers: body.delivery.fillers, spoken: !!body.delivery.spoken };

      const done = s.qa.length >= Math.min(s.plan.length + 2, QUESTIONS_PER_INTERVIEW) ||
                   (s.qa.length >= s.plan.length && !(cur.evaluation.score <= 5 && !cur.is_followup));
      let out = { evaluation: cur.evaluation, done, number: s.qa.length, total: s.plan.length };
      if (!done) {
        const nq = await nextQuestion(s);
        s.qa.push({ question: nq.question, meta: nq.meta, context: nq.context, is_followup: nq.is_followup });
        out.question = nq.question; out.meta = nq.meta; out.is_followup = nq.is_followup;
        out.number = s.qa.length;
      } else { s.status = 'finished'; }
      await supabase.from('coach_sessions').update({ qa: s.qa, status: s.status }).eq('id', s.id);
      return res.status(200).json(out);
    }

    // ---------------- REPORT ----------------
    if (body.action === 'report') {
      const { data: s } = await supabase.from('coach_sessions').select('*').eq('id', body.session_id).eq('email', email).single();
      if (!s) return res.status(404).json({ error: 'Session not found.' });
      const answered = (s.qa || []).filter(q => q.evaluation);
      const avg = answered.length ? Math.round(answered.reduce((t, q) => t + (q.evaluation.score || 0), 0) / answered.length * 10) / 10 : 0;
      const weak = answered.filter(q => (q.evaluation.score || 0) <= 6 && q.meta);
      const recsMap = {};
      weak.forEach(q => { const k = `${q.meta.book}|${q.meta.chapter_n}`;
        recsMap[k] = { book: q.meta.book, book_name: q.meta.book_name, chapter_n: q.meta.chapter_n, chapter_title: q.meta.chapter_title, topics: [...(recsMap[k]?.topics || []), q.meta.topic_title] }; });
      const report = {
        average_score: avg, questions: answered.length, job: s.job || null, mode: s.mode || 'text',
        items: answered.map(q => ({ question: q.question, answer: q.answer, evaluation: q.evaluation, meta: q.meta, is_followup: q.is_followup, delivery: q.delivery || null })),
        recommendations: Object.values(recsMap),
      };
      if (RESEND && s.status === 'finished') {
        try {
          const recHtml = report.recommendations.length
            ? '<p><b>Where to strengthen:</b></p>' + report.recommendations.map(r =>
                `<p style="margin:6px 0">📘 ${r.book_name} — Chapter ${r.chapter_n}: ${r.chapter_title}<br><a href="${SITE}/reader.html?book=${r.book}" style="color:#e0a668">Open the book →</a></p>`).join('')
            : '<p>Solid performance across the board. Raise the difficulty next time.</p>';
          const html = `<div style="background:#080d18;padding:32px 0;font-family:Arial,sans-serif"><div style="max-width:540px;margin:0 auto;background:#0c1424;border:1px solid #22304a;border-radius:18px"><div style="padding:24px 28px;color:#c3d1e8;font-size:15px;line-height:1.65"><div style="font-weight:800;font-size:22px;color:#eaf1ff">Gear<span style="color:#C88A4B">Up</span> <span style="font-size:12px;color:#93a6c6">INTERVIEW COACH</span></div><h1 style="font-size:20px;color:#fff;margin:14px 0 8px">Your interview report: ${avg}/10 average</h1><p>${report.questions} questions${s.job ? ' · practising for ' + s.job.title : ''}. Keep this for your records and revisit the weak spots below.</p>${recHtml}<div style="text-align:center;margin:22px 0 6px"><a href="${SITE}/coach.html" style="display:inline-block;background:#e0a668;color:#1c1206;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:10px">Practice another interview →</a></div></div></div></div>`;
          await fetch('https://api.resend.com/emails', { method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to: [email], reply_to: 'subramanian@gearup.study', subject: `Your GearUp interview report — ${avg}/10 🔧`, html }) });
          await supabase.from('coach_sessions').update({ status: 'reported' }).eq('id', s.id);
        } catch (e) { console.error('report email', e); }
      }
      return res.status(200).json({ report });
    }

    // ---------------- HISTORY (progress page) ----------------
    if (body.action === 'history') {
      const { data: rows } = await supabase.from('coach_sessions')
        .select('id,created_at,skills,difficulty,mode,job,qa,status').eq('email', email)
        .in('status', ['finished', 'reported']).order('created_at', { ascending: false }).limit(30);
      const sessions = (rows || []).map(r => {
        const ans = (r.qa || []).filter(q => q.evaluation);
        const avg = ans.length ? Math.round(ans.reduce((t, q) => t + (q.evaluation.score || 0), 0) / ans.length * 10) / 10 : 0;
        return { id: r.id, date: r.created_at, skills: r.skills, difficulty: r.difficulty, mode: r.mode || 'text',
                 job: r.job ? r.job.title : null, questions: ans.length, average_score: avg };
      });
      return res.status(200).json({ sessions });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('coach', e);
    return res.status(500).json({ error: String(e.message || e).slice(0, 300) });
  }
}
