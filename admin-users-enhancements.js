(function(){
  const SUPABASE_URL='https://ftugvecpcqjtvoiktjly.supabase.co';
  const SUPABASE_KEY='sb_publishable_-0pRAIJEppMpN2wlsjXfJg_Hg5CuieZ';
  let parentDb=null;
  let frame=null;
  let timer=null;
  let bootTimer=null;
  let hooked=false;

  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const statusClass=s=>s==='approved'?'ok':s==='rejected'?'bad':'warn';
  const statusLabel=s=>({approved:'Approved',under_review:'Under review',rejected:'Rejected',not_started:'KYC not started'}[s]||s);

  function getDoc(){try{return frame?.contentDocument||null}catch(_){return null}}
  function getWin(){try{return frame?.contentWindow||null}catch(_){return null}}

  function deriveStatus(profile,app){
    const raw=String(profile?.kyc_status||app?.status||'not_started').toLowerCase();
    if(raw==='approved') return 'approved';
    if(raw==='rejected') return 'rejected';
    if(['pending_review','under_review','additional_info_required','submitted'].includes(raw)) return 'under_review';
    return 'not_started';
  }

  async function fetchUsers(){
    const [p,w,k]=await Promise.all([
      parentDb.from('profiles').select('*').order('created_at',{ascending:false}).limit(500),
      parentDb.from('wallets').select('user_id,available_balance').limit(500),
      parentDb.from('kyc_applications').select('user_id,status,submitted_at').order('submitted_at',{ascending:false}).limit(1000)
    ]);
    if(p.error) throw p.error;
    if(w.error) throw w.error;
    if(k.error) throw k.error;
    const wallets=Object.fromEntries((w.data||[]).map(x=>[x.user_id,x]));
    const apps={};
    for(const x of (k.data||[])){if(!apps[x.user_id]) apps[x.user_id]=x}
    return (p.data||[]).map(u=>({...u,_wallet:wallets[u.id]||{},_kyc:deriveStatus(u,apps[u.id]),_kycApp:apps[u.id]||null}));
  }

  function injectStyles(doc){
    if(doc.getElementById('lw-users-enhancement-style')) return;
    const s=doc.createElement('style');s.id='lw-users-enhancement-style';
    s.textContent='.lw-user-tools{border:1px solid #25303c;background:#0d1219;border-radius:12px;padding:13px;margin-bottom:12px}.lw-user-tools-row{display:grid;grid-template-columns:1fr 220px;gap:10px}.lw-user-tools input,.lw-user-tools select{margin-top:0}.lw-user-counts{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.lw-count{font-size:12px;padding:5px 8px;border:1px solid #334052;border-radius:99px;color:#aeb8c6}.lw-count b{color:#f2f4f7}.lw-delete{border-color:#6d3a3a!important;color:#ffb0b0!important}.lw-delete:hover{background:#241215}.lw-user-warning{color:#ffb0b0;font-size:12px;margin-top:7px}@media(max-width:600px){.lw-user-tools-row{grid-template-columns:1fr}}';
    doc.head.appendChild(s);
  }

  function renderTools(doc,users){
    const box=doc.getElementById('usersBox');
    if(!box) return null;
    let tools=doc.getElementById('lwUserTools');
    if(!tools){
      tools=doc.createElement('div');tools.id='lwUserTools';tools.className='lw-user-tools';
      tools.innerHTML='<div class="lw-user-tools-row"><input id="lwUserSearch" type="search" placeholder="Search members by name or user ID"><select id="lwUserFilter"><option value="all">All members</option><option value="approved">KYC approved</option><option value="under_review">KYC under review</option><option value="not_started">KYC not started</option><option value="rejected">KYC rejected</option></select></div><div id="lwUserCounts" class="lw-user-counts"></div>';
      box.parentNode.insertBefore(tools,box);
    }
    const search=tools.querySelector('#lwUserSearch'),filter=tools.querySelector('#lwUserFilter');
    const counts={all:users.length,approved:0,under_review:0,not_started:0,rejected:0};
    users.forEach(u=>counts[u._kyc]=(counts[u._kyc]||0)+1);
    tools.querySelector('#lwUserCounts').innerHTML=['all','approved','under_review','not_started','rejected'].map(k=>'<span class="lw-count">'+(k==='all'?'All members':statusLabel(k))+' <b>'+counts[k]+'</b></span>').join('');
    const render=()=>renderRows(doc,users,search.value.trim().toLowerCase(),filter.value);
    search.oninput=render;filter.onchange=render;
    return render;
  }

  function renderRows(doc,users,query,filter){
    const box=doc.getElementById('usersBox');if(!box)return;
    const rows=users.filter(u=>{
      const matchesFilter=filter==='all'||u._kyc===filter;
      const hay=(u.full_name||'')+' '+u.id;
      return matchesFilter&&(!query||hay.toLowerCase().includes(query));
    });
    box.innerHTML=rows.length?rows.map(u=>{
      const st=u._kyc;
      const bal=Number(u._wallet?.available_balance||0).toFixed(2);
      const kycText=st==='not_started'?'KYC not started':statusLabel(st);
      return '<div class="row"><div class="row-main"><div class="row-title">'+esc(String(u.full_name||'Unnamed member').toUpperCase())+'</div><div class="muted">'+esc(u.id)+'</div><div>Balance: <b>$'+bal+'</b> · KYC: <span class="pill '+statusClass(st)+'">'+esc(kycText)+'</span></div></div><div class="actions"><form class="balance-form" data-user="'+esc(u.id)+'"><input name="amount" type="number" step=".01" placeholder="+ / - USD" required style="max-width:130px"><input name="reason" placeholder="Reason" required style="max-width:180px"><button class="btn gold small">Adjust</button></form><button class="btn danger small lw-delete" data-lw-delete="'+esc(u.id)+'" data-lw-name="'+esc(String(u.full_name||'this member').toUpperCase())+'">Delete user</button></div></div>';
    }).join(''):'<div class="empty">No members match this filter.</div>';

    doc.querySelectorAll('.balance-form').forEach(f=>f.addEventListener('submit',async e=>{
      e.preventDefault();const b=e.submitter;b.disabled=true;
      try{const r=await parentDb.rpc('admin_adjust_balance',{p_user:f.dataset.user,p_amount:Number(f.amount.value),p_currency:'USD',p_reason:f.reason.value});if(r.error)throw r.error;await enhanceUsers(true);alert('Balance adjusted successfully.')}catch(err){alert(err.message||String(err))}finally{b.disabled=false}
    }));
    doc.querySelectorAll('[data-lw-delete]').forEach(b=>b.addEventListener('click',()=>deleteUser(b.dataset.lwDelete,b.dataset.lwName)));
  }

  async function deleteUser(id,name){
    if(!parentDb)return;
    if(!confirm('Delete '+name+' permanently? This removes the account and its Legacy Wealth data. The member will have to register again.'))return;
    const typed=prompt('Type DELETE to confirm permanent deletion.');
    if(typed!=='DELETE'){alert('Deletion cancelled.');return}
    try{
      const {data:{user:admin},error:ue}=await parentDb.auth.getUser();if(ue)throw ue;
      if(!admin)throw new Error('Administrator session not found.');
      const k=await parentDb.from('kyc_applications').select('nin_front_path,nin_back_path,selfie_path').eq('user_id',id);if(k.error)throw k.error;
      const d=await parentDb.from('deposits').select('proof_url').eq('user_id',id);if(d.error)throw d.error;
      const kycPaths=[...new Set((k.data||[]).flatMap(x=>[x.nin_front_path,x.nin_back_path,x.selfie_path]).filter(Boolean))];
      const receiptPaths=[...new Set((d.data||[]).map(x=>x.proof_url).filter(Boolean))];
      if(kycPaths.length){const r=await parentDb.storage.from('kyc-documents').remove(kycPaths);if(r.error)throw r.error}
      if(receiptPaths.length){const r=await parentDb.storage.from('deposit-receipts').remove(receiptPaths);if(r.error)throw r.error}
      const r=await parentDb.rpc('admin_delete_user',{p_user_id:id});if(r.error)throw r.error;
      alert('User deleted permanently. They must register again to create a new account.');
      getWin()?.location.reload();
    }catch(err){alert('User was not deleted: '+(err?.message||String(err)))}
  }

  async function enhanceUsers(){
    const doc=getDoc();if(!doc||!parentDb)return;
    const section=doc.getElementById('users');
    const box=doc.getElementById('usersBox');
    if(!section||!box||!section.classList.contains('active'))return;
    injectStyles(doc);
    try{
      const users=await fetchUsers();
      const render=renderTools(doc,users);
      if(render)render();
      box.dataset.lwEnhanced='1';
    }catch(err){box.innerHTML='<div class="notice error">'+esc(err?.message||String(err))+'</div>'}
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(()=>enhanceUsers(),120)}

  function hook(){
    const doc=getDoc();if(!doc||hooked)return;
    hooked=true;
    doc.addEventListener('click',e=>{
      const b=e.target.closest('.nav[data-section="users"], [data-reload="users"]');
      if(b){clearTimeout(timer);timer=setTimeout(()=>enhanceUsers(),300)}
    },true);
    // Keep checking because the native admin UI can change the active section after this hook runs.
    const observer=new MutationObserver(()=>{if(doc.getElementById('users')?.classList.contains('active'))schedule()});
    observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['class']});
    schedule();
  }

  function boot(){
    frame=document.querySelector('iframe');
    if(!frame){bootTimer=setTimeout(boot,500);return}
    if(window.supabase?.createClient){
      parentDb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    }else{
      bootTimer=setTimeout(boot,500);return;
    }
    frame.addEventListener('load',()=>{hooked=false;hook()});
    if(frame.contentDocument?.readyState==='complete')hook();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
