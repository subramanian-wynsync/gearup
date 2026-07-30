// GearUp Interview Coach — one-time book indexer.
// Reads a book JSON from the private Supabase `books` bucket, splits it into
// chapter/topic study chunks, and stores them in coach_chunks for retrieval.
// Run once per book after deploy:  /api/coach-index?book=fea&secret=<CRON_SECRET>
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BOOKS = ['fea', 'cfd', 'design', 'biw', 'plastics'];

function textOf(v){
  // book content blocks can be strings or arrays of {t:'p'|'h'|'ul'|..., ...}
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(b => {
    if (typeof b === 'string') return b;
    if (Array.isArray(b.items)) return b.items.join('. ');
    return b.text || b.c || b.body || '';
  }).join('\n');
  return '';
}

export default async function handler(req, res){
  const { book, secret } = req.query || {};
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)
    return res.status(401).json({ error: 'unauthorized' });
  if (!BOOKS.includes(book)) return res.status(400).json({ error: 'book must be one of ' + BOOKS.join(', ') });

  try {
    const { data: file, error: dlErr } = await supabase.storage.from('books').download(book + '.json');
    if (dlErr) return res.status(500).json({ error: 'download failed: ' + dlErr.message });
    const D = JSON.parse(await file.text());

    const rows = [];
    (D.chapters || []).forEach((ch, ci) => {
      (ch.topics || []).forEach(t => {
        const content = [textOf(t.concept), textOf(t.why), textOf(t.qa)]
          .filter(Boolean).join('\n').slice(0, 2400);
        if (!content || content.length < 80) return;
        rows.push({
          book,
          chapter_n: ch.n || ci + 1,
          chapter_title: String(ch.title || '').slice(0, 200),
          topic_title: String(t.title || '').slice(0, 200),
          content,
        });
      });
    });

    await supabase.from('coach_chunks').delete().eq('book', book);
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from('coach_chunks').insert(rows.slice(i, i + 100));
      if (error) return res.status(500).json({ error: 'insert failed: ' + error.message, at: i });
    }
    return res.status(200).json({ ok: true, book, chunks: rows.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
