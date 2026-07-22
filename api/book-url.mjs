import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
export default async function handler(req, res) {
  const token = (req.headers.authorization||'').replace('Bearer ','');
  const book = (req.query.book||'').toString();
  if(!token||!book) return res.status(400).json({error:'missing'});
  const { data:{ user } } = await admin.auth.getUser(token);
  if(!user) return res.status(401).json({error:'not logged in'});
  const { data:pur } = await admin.from('purchases').select('book_id').eq('user_id', user.id);
  const owns = (pur||[]).some(r => r.book_id===book || r.book_id==='bundle');
  if(!owns) return res.status(403).json({error:'you do not own this book'});
  const { data, error } = await admin.storage.from('books').createSignedUrl(book+'.html', 1800);
  if(error) return res.status(500).json({error:error.message});
  return res.status(200).json({ url: data.signedUrl });
}
