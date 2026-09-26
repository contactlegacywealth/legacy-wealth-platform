(async function(){
  const root=document.documentElement;
  root.style.visibility='hidden';
  try{
    if(!window.supabase){root.style.visibility='visible';return}
    const db=window.supabase.createClient('https://ftugvecpcqjtvoiktjly.supabase.co','sb_publishable_-0pRAIJEppMpN2wlsjXfJg_Hg5CuieZ');
    const {data:{user},error:authError}=await db.auth.getUser();
    if(authError||!user){root.style.visibility='visible';return}
    const {data:admin,error}=await db.from('admin_users').select('user_id').eq('user_id',user.id).eq('active',true).maybeSingle();
    if(error){console.error('Role guard check failed:',error);root.style.visibility='visible';return}
    if(admin){location.replace('admin-branded.html');return}
    root.style.visibility='visible';
  }catch(error){console.error('Member role guard failed:',error);root.style.visibility='visible'}
})();
