// GearUp auth + gating + single active login. Load after supabase-js + config.js.
function GearUpAuth(url, anonKey){
  const sb = window.supabase.createClient(url, anonKey);
  const BOOKS = ['biw','plastics','design','fea','cfd'];
  const SID='gu_sid';
  const newSid=()=> (crypto.randomUUID? crypto.randomUUID(): String(Date.now())+Math.random());
  async function forceLogout(){ try{await sb.auth.signOut();}catch(e){} localStorage.removeItem(SID); location.href='login.html?kicked=1'; }
  let channel=null;
  return {
    sb,
    sendLoginLink:(email)=>sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin+'/portal.html' } }),
    signOut: async()=>{ localStorage.removeItem(SID); return sb.auth.signOut(); },
    getUser: async()=> (await sb.auth.getUser()).data.user,
    token: async()=> (await sb.auth.getSession()).data.session?.access_token,
    ownedBooks: async()=>{ const {data}=await sb.from('purchases').select('book_id'); const ids=(data||[]).map(r=>r.book_id); return ids.includes('bundle')?BOOKS:ids; },
    getProgress: async()=> (await sb.from('progress').select('*')).data||[],
    saveProgress: async(book_id,chapter,pct)=>{ const u=(await sb.auth.getUser()).data.user; if(!u)return; return sb.from('progress').upsert({user_id:u.id,book_id,chapter,pct,updated_at:new Date().toISOString()}); },
    claimSession: async function(){ const u=(await sb.auth.getUser()).data.user; if(!u)return; const sid=newSid(); localStorage.setItem(SID,sid);
      await sb.from('active_session').upsert({user_id:u.id,session_id:sid,updated_at:new Date().toISOString()});
      if(channel) sb.removeChannel(channel);
      channel=sb.channel('gu_'+u.id).on('postgres_changes',{event:'*',schema:'public',table:'active_session',filter:'user_id=eq.'+u.id},
        (p)=>{ const cur=p.new&&p.new.session_id; if(cur&&cur!==localStorage.getItem(SID)) forceLogout(); }).subscribe();
    },
    enforceSingle: async function(){ const u=(await sb.auth.getUser()).data.user; if(!u)return false;
      const {data}=await sb.from('active_session').select('session_id').eq('user_id',u.id).single();
      if(data&&data.session_id!==localStorage.getItem(SID)){ forceLogout(); return false; } return true; },
    // returns a short-lived signed URL to read a book the user owns (via the backend)
    openBookUrl: async function(book_id){
      const t=await this.token(); if(!t){ location.href='login.html'; return null; }
      const r=await fetch('/api/book-url?book='+encodeURIComponent(book_id),{headers:{Authorization:'Bearer '+t}});
      const d=await r.json(); if(!d.url){ alert(d.error||'Could not open the book'); return null; }
      // Fetch the file directly from storage and force it to render as HTML,
      // regardless of the content-type Supabase serves it with.
      try{
        const res=await fetch(d.url);
        if(!res.ok) return d.url;
        const html=await res.text();
        const blob=new Blob([html],{type:'text/html'});
        return URL.createObjectURL(blob);
      }catch(e){ return d.url; }
    }
  };
}
