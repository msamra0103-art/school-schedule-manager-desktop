(() => {
  'use strict';
  const loading = document.getElementById('appLoading');
  const message = document.getElementById('loadingMessage');
  const keys = { state:'school_schedule_manager_abu_ubaida_v3', account:'schoolScheduleCloudAccountV1', revision:'schoolScheduleCloudRevisionV1' };
  const config = window.SUPABASE_CONFIG || {};
  const factory = window.supabase?.createClient;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]);
  const response = (data,status=200) => Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}}));
  const cached = key => { try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null} };
  const normalize = error => {
    const text=error?.message||String(error||'تعذر تنفيذ العملية.');
    if(/invalid login credentials/i.test(text))return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    if(/email not confirmed/i.test(text))return 'يجب تأكيد البريد الإلكتروني أولًا من رسالة Supabase.';
    if(/user already registered/i.test(text))return 'هذا البريد مسجل بالفعل؛ استخدم تسجيل الدخول.';
    if(/password should be/i.test(text))return 'كلمة المرور قصيرة؛ استخدم 8 أحرف على الأقل.';
    if(/revision_conflict/i.test(text))return 'توجد نسخة أحدث من الجدول على السحابة. أعد تحميل الصفحة قبل الحفظ.';
    return text;
  };
  const showError=(title,detail)=>{loading.classList.add('error');loading.querySelector('h1').textContent=title;message.textContent=detail};
  function authScreen(note=''){
    loading.classList.remove('error');
    loading.innerHTML=`<div class="auth-card"><div class="auth-brand"><span class="loading-logo">ج</span><div><h1>لوحة إدارة الجدول المدرسي</h1><p>دخول آمن ومزامنة سحابية عبر Supabase</p></div></div>${note?`<div class="auth-note">${esc(note)}</div>`:''}<div class="auth-tabs"><button type="button" class="active" data-auth-tab="login">تسجيل الدخول</button><button type="button" data-auth-tab="signup">إنشاء الحساب أول مرة</button></div><form id="cloudAuthForm" class="auth-form"><label>البريد الإلكتروني<input id="cloudEmail" type="email" autocomplete="username" required placeholder="name@example.com"></label><label>كلمة المرور<input id="cloudPassword" type="password" autocomplete="current-password" minlength="8" required placeholder="8 أحرف على الأقل"></label><button class="primary-btn full" type="submit" id="cloudAuthSubmit">دخول</button></form><button class="text-btn auth-reset" type="button" id="cloudResetPassword">نسيت كلمة المرور؟</button><p class="auth-help">المدير الأساسي يستخدم البريد <b dir="ltr">m.samra0103@gmail.com</b>. عند الدخول لأول مرة اختر «إنشاء الحساب أول مرة» بالبريد نفسه.</p><p class="auth-status" id="cloudAuthStatus" aria-live="polite"></p></div>`;
  }
  function bindAuth(client){
    let mode='login';const form=document.getElementById('cloudAuthForm'),status=document.getElementById('cloudAuthStatus'),submit=document.getElementById('cloudAuthSubmit');
    document.querySelectorAll('[data-auth-tab]').forEach(button=>button.onclick=()=>{mode=button.dataset.authTab;document.querySelectorAll('[data-auth-tab]').forEach(x=>x.classList.toggle('active',x===button));submit.textContent=mode==='signup'?'إنشاء الحساب وربطه':'دخول';document.getElementById('cloudPassword').autocomplete=mode==='signup'?'new-password':'current-password';status.textContent=''});
    form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;status.textContent='جارٍ التحقق…';const email=document.getElementById('cloudEmail').value.trim().toLowerCase(),password=document.getElementById('cloudPassword').value;try{const result=mode==='signup'?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(!result.data.session){status.textContent='تم إنشاء الحساب. افتح رسالة التأكيد في بريدك ثم سجّل الدخول.';return}location.reload()}catch(error){status.textContent=normalize(error)}finally{submit.disabled=false}};
    document.getElementById('cloudResetPassword').onclick=async()=>{const email=document.getElementById('cloudEmail').value.trim().toLowerCase();if(!email){status.textContent='اكتب البريد الإلكتروني أولًا.';return}const {error}=await client.auth.resetPasswordForEmail(email);status.textContent=error?normalize(error):'أُرسلت رسالة استعادة كلمة المرور إلى بريدك.'};
  }
  function loadApp(){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='app.js';script.onload=()=>{loading.remove();resolve()};script.onerror=()=>reject(new Error('تعذر تحميل ملف تشغيل اللوحة.'));document.body.append(script)})}
  function offlineStart(reason){const state=cached(keys.state),account=cached(keys.account);if(!state||!account)return false;window.LOCAL_MODE=true;window.SERVER_SCHEDULE_STATE=state;window.APP_SESSION={user:{...account,offline:true}};message.textContent=`تعذر الاتصال بالسحابة؛ تشغيل آخر نسخة محفوظة على الجهاز. (${normalize(reason)})`;loadApp().catch(e=>showError('تعذر تشغيل اللوحة',e.message));return true}
  async function claimAccount(client){const result=await client.rpc('claim_my_schedule_account');if(result.error)throw result.error;const row=Array.isArray(result.data)?result.data[0]:result.data;if(!row)throw new Error('هذا البريد غير مضاف إلى حسابات لوحة الجدول.');return mapAccount(row)}
  function mapAccount(row){return {id:row.id,userId:row.user_id,email:row.email,username:row.username,displayName:row.display_name,role:row.role,department:row.department,active:row.active,isPrimary:row.is_primary}}
  function adapter(client){return async(url,options={})=>{const method=(options.method||'GET').toUpperCase();let body={};try{body=options.body?JSON.parse(options.body):{}}catch(_){return response({error:'صيغة الطلب غير صحيحة.'},400)}try{
    if(url==='/api/state'&&method==='GET'){const {data,error}=await client.from('schedule_state').select('state_json,revision,updated_at').eq('state_key','main').maybeSingle();if(error)throw error;if(data)localStorage.setItem(keys.revision,String(data.revision||0));return response({state:data?.state_json||null,revision:data?.revision||0,updatedAt:data?.updated_at||null})}
    if(url==='/api/state'&&method==='PUT'){const expected=Number(localStorage.getItem(keys.revision)||0);const {data,error}=await client.rpc('save_schedule_state',{p_state:body.state,p_expected_revision:expected});if(error)throw error;localStorage.setItem(keys.revision,String(data.revision||expected+1));return response(data)}
    if(url==='/api/substitutions'&&method==='PUT'){const {data,error}=await client.rpc('save_department_substitutions',{p_records:body.records||[]});if(error)throw error;return response(data||{ok:true})}
    if(url==='/api/accounts'&&method==='GET'){const {data,error}=await client.from('schedule_accounts').select('*').order('is_primary',{ascending:false}).order('display_name');if(error)throw error;return response({accounts:(data||[]).map(mapAccount)})}
    if(url==='/api/accounts'&&method==='POST'){const row={email:String(body.email||'').trim().toLowerCase(),username:String(body.username||'').trim(),display_name:String(body.displayName||'').trim(),role:body.role,department:body.role==='department'?String(body.department||'').trim():null,active:true,is_primary:false};const {data,error}=await client.from('schedule_accounts').insert(row).select().single();if(error)throw error;return response({account:mapAccount(data)},201)}
    const match=url.match(/^\/api\/accounts\/(\d+)$/);
    if(match&&method==='PATCH'){const changes={role:body.role,department:body.role==='department'?String(body.department||'').trim():null,active:body.active!==false,updated_at:new Date().toISOString()};const {data,error}=await client.from('schedule_accounts').update(changes).eq('id',Number(match[1])).select().single();if(error)throw error;return response({account:mapAccount(data)})}
    if(match&&method==='DELETE'){const {error}=await client.from('schedule_accounts').delete().eq('id',Number(match[1]));if(error)throw error;return response({ok:true})}
    return response({error:'المسار المطلوب غير مدعوم.'},404)
  }catch(error){const status=/revision_conflict|duplicate key|unique constraint/i.test(error?.message||'')?409:400;return response({error:normalize(error)},status)}}}
  async function start(){
    if(!config.url||!config.publishableKey||!factory){if(!offlineStart('إعداد الاتصال السحابي غير مكتمل'))showError('إعداد الاتصال غير مكتمل','ملفات Supabase غير موجودة أو غير صحيحة.');return}
    const client=factory(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});window.SUPABASE_CLIENT=client;
    try{const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session){authScreen();bindAuth(client);return}message.textContent='جارٍ ربط الحساب وقراءة أحدث نسخة من الجدول…';const account=await claimAccount(client);if(!account.active)throw new Error('هذا الحساب معطّل. تواصل مع المدير الأساسي.');window.APP_SESSION={user:account};localStorage.setItem(keys.account,JSON.stringify(account));window.SCHEDULE_API_FETCH=adapter(client);const stateResponse=await window.SCHEDULE_API_FETCH('/api/state'),shared=await stateResponse.json();window.SERVER_SCHEDULE_STATE=shared.state||cached(keys.state)||window.IMPORTED_SCHEDULE_STATE;if(!shared.state&&account.role==='full'&&window.SERVER_SCHEDULE_STATE){const seedResponse=await window.SCHEDULE_API_FETCH('/api/state',{method:'PUT',body:JSON.stringify({state:window.SERVER_SCHEDULE_STATE})});if(!seedResponse.ok){const seedError=await seedResponse.json();throw new Error(seedError.error||'تعذر رفع النسخة الأولية إلى السحابة.')}}window.LOCAL_MODE=false;await loadApp();const logout=document.getElementById('logoutBtn');if(logout)logout.onclick=async()=>{await client.auth.signOut();localStorage.removeItem(keys.account);location.reload()}}
    catch(error){if(offlineStart(error))return;await client.auth.signOut().catch(()=>{});authScreen(normalize(error));bindAuth(client)}
  }
  start().catch(error=>{if(!offlineStart(error))showError('تعذر تشغيل لوحة الجدول',normalize(error))});
})();
