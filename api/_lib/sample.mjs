// GearUp — free sample of an i-Book for any signed-in reader: front matter + the first 2 chapters.
// GET /api/book-data?book=<id>&sample=1  (Authorization: Bearer <supabase access token>)
// Builds samples/<id>.json in the private "books" bucket from <id>.json the first time,
// rebuilds it whenever the full book file is replaced, and returns a short-lived signed URL.
// Works for any future book uploaded as <id>.json — nothing to configure.
import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
export const FREE_CHAPTERS = 2;
const FRONT = /^(preface|foreword|how to read|introduction|about (this|the) book|acknowledg|note to|dedication)/i;

export function buildSample(D, free = FREE_CHAPTERS){
  let counted = 0, cut = D.chapters.length;
  for (let i = 0; i < D.chapters.length; i++) {
    const t = String(D.chapters[i].title || '').replace(/^chapter\s+\d+\s*[—–:-]\s*/i, '');
    const isFront = FRONT.test(String(D.chapters[i].title || '')) && counted === 0;
    if (!isFront) counted++;
    if (counted === free) { cut = i + 1; break; }
  }
  const out = { ...D, sample: true, freeChapters: free, chapters: [] };
  const usedDiagrams = new Set(), usedImages = new Set();
  D.chapters.forEach((c, i) => {
    if (i < cut) {
      out.chapters.push(c);
      (c.topics || []).forEach(t => {
        (t.diagrams || []).forEach(d => usedDiagrams.add(d[0]));
        if (t.hero) usedImages.add(t.hero);
      });
    } else {
      out.chapters.push({ n: c.n, title: c.title, locked: true, topics: [], mcqs: [] });
    }
  });
  if (D.diagrams) out.diagrams = Object.fromEntries(Object.entries(D.diagrams).filter(([k]) => usedDiagrams.has(k)));
  if (D.images) out.images = Object.fromEntries(Object.entries(D.images).filter(([k]) => usedImages.has(k)));
  return out;
}

async function meta(path){
  const i = path.lastIndexOf('/'); const dir = i < 0 ? '' : path.slice(0, i); const name = path.slice(i + 1);
  const { data } = await admin.storage.from('books').list(dir, { search: name, limit: 100 });
  return (data || []).find(o => o.name === name) || null;
}

export default async function handler(req, res){
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const book = String(req.query.book || '').toLowerCase();
    if (!token || !/^[a-z0-9-]{2,30}$/.test(book)) return res.status(400).json({ error: 'missing' });
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'not logged in' });

    const src = await meta(book + '.json');
    if (!src) return res.status(404).json({ error: 'book not found' });
    const smp = await meta('samples/' + book + '.json');
    const fresh = smp && new Date(smp.updated_at || smp.created_at) >= new Date(src.updated_at || src.created_at);
    if (!fresh) {
      const { data: blob, error } = await admin.storage.from('books').download(book + '.json');
      if (error) return res.status(500).json({ error: error.message });
      const D = JSON.parse(await blob.text());
      const S = buildSample(D);
      const body = Buffer.from(JSON.stringify(S));
      const up = await admin.storage.from('books').upload('samples/' + book + '.json', body, { contentType: 'application/json', upsert: true });
      if (up.error) return res.status(500).json({ error: up.error.message });
    }
    const { data, error } = await admin.storage.from('books').createSignedUrl('samples/' + book + '.json', 1800);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ url: data.signedUrl, sample: true });
  } catch (e) {
    console.error('book-sample', e);
    return res.status(500).json({ error: 'Could not load the free chapters' });
  }
}
