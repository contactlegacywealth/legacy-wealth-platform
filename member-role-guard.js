(async function(){
  try{
    if(!window.supabase){return}
    const db=window.supabase.createClient('https://ftugvecpcqjtvoiktjly.supabase.co','sb_publishable_-0pRAIJEppMpN2wlsjXfJg_Hg5CuieZ');
    const {data:{user},error:authError}=await db.auth.getUser();
    if(authError||!user){return}
    const {data:admin,error}=await db.from('admin_users').select('user_id').eq('user_id',user.id).eq('active',true).maybeSingle();
    if(error){console.error('Role guard check failed:',error);return}
    if(admin){location.replace('admin-branded.html')}
  }catch(error){console.error('Member role guard failed:',error)}
})();
