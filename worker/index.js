const EMBEDDED = __EMBEDDED_ASSET_MAP__;
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".png":"image/png", ".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const now = ()=>new Date().toISOString();
const identity = request=>({userId:request.headers.get("oai-authenticated-user-id")||"",email:(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),name:decodeName(request)});
function decodeName(request){const raw=request.headers.get("oai-authenticated-user-full-name");if(!raw||request.headers.get("oai-authenticated-user-full-name-encoding")!=="percent-encoded-utf-8")return"";try{return decodeURIComponent(raw)}catch{return""}}
const cleanAccount=row=>row?({id:row.id,userId:row.user_id||"",email:row.email,username:row.username,displayName:row.display_name,role:row.role,department:row.department||"",active:!!row.active,isPrimary:!!row.is_primary,createdAt:row.created_at,updatedAt:row.updated_at}):null;
const audit=(db,actor,action,details="")=>db.prepare("INSERT INTO audit_log (actor_user_id,action,details,created_at) VALUES (?,?,?,?)").bind(actor,action,details,now()).run();

async function currentAccount(request,db){
  const who=identity(request);if(!who.userId||!who.email)return{who,account:null};
  let row=await db.prepare("SELECT * FROM accounts WHERE user_id=? OR email=? COLLATE NOCASE LIMIT 1").bind(who.userId,who.email).first();
  if(!row){const count=await db.prepare("SELECT COUNT(*) AS total FROM accounts").first();if(Number(count?.total||0)===0){const stamp=now();await db.prepare("INSERT INTO accounts (user_id,email,username,display_name,role,department,active,is_primary,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(who.userId,who.email,"M.samra0103",who.name||"المدير الأساسي","full",null,1,1,stamp,stamp).run();row=await db.prepare("SELECT * FROM accounts WHERE user_id=?").bind(who.userId).first();await audit(db,who.userId,"bootstrap_primary_admin",who.email)}}
  else if(!row.user_id){await db.prepare("UPDATE accounts SET user_id=?,updated_at=? WHERE id=?").bind(who.userId,now(),row.id).run();row=await db.prepare("SELECT * FROM accounts WHERE id=?").bind(row.id).first()}
  return{who,account:row&&row.active?cleanAccount(row):null};
}
const deny=(account,full=false)=>!account?json({error:"غير مصرح بالدخول إلى لوحة الجدول."},401):full&&account.role!=="full"?json({error:"هذه العملية متاحة للمدير كامل الصلاحيات فقط."},403):null;
async function body(request){try{return await request.json()}catch{return null}}

async function api(request,env,path){
  if(!env.DB)return json({error:"قاعدة بيانات الحسابات غير متاحة مؤقتًا."},503);
  const {who,account}=await currentAccount(request,env.DB);
  if(path==="/api/session"&&request.method==="GET")return account?json({authorized:true,user:account,identity:{email:who.email,name:who.name}}):json({authorized:false,identity:{email:who.email,name:who.name}},403);
  const blocked=deny(account);if(blocked)return blocked;
  if(path==="/api/state"&&request.method==="GET"){
    const row=await env.DB.prepare("SELECT state_json,revision,updated_at FROM app_state WHERE state_key='main'").first();
    return json({state:row?JSON.parse(row.state_json):null,revision:Number(row?.revision||0),updatedAt:row?.updated_at||null});
  }
  if(path==="/api/state"&&request.method==="PUT"){
    const fullOnly=deny(account,true);if(fullOnly)return fullOnly;const data=await body(request);if(!data?.state||typeof data.state!=="object")return json({error:"بيانات الجدول غير صالحة."},400);
    const text=JSON.stringify(data.state);if(text.length>8_000_000)return json({error:"حجم بيانات الجدول أكبر من المسموح."},413);const stamp=now();
    await env.DB.prepare("INSERT INTO app_state (state_key,state_json,revision,updated_at,updated_by) VALUES ('main',?,1,?,?) ON CONFLICT(state_key) DO UPDATE SET state_json=excluded.state_json,revision=app_state.revision+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(text,stamp,who.userId).run();
    return json({ok:true,updatedAt:stamp});
  }
  if(path==="/api/substitutions"&&request.method==="PUT"){
    const data=await body(request),records=Array.isArray(data?.records)?data.records:null;if(!records)return json({error:"سجل التبديلات غير صالح."},400);
    const row=await env.DB.prepare("SELECT state_json FROM app_state WHERE state_key='main'").first();if(!row)return json({error:"يجب أن يفتح المدير الأساسي الجدول ويحفظه أولًا."},409);const state=JSON.parse(row.state_json);
    if(account.role==="department"){const teachers=new Map((state.teachers||[]).map(t=>[t.id,t]));if(records.some(r=>teachers.get(r.absentTeacherId)?.department!==account.department))return json({error:"يمكنك تعديل غياب واستئذان معلمي قسمك فقط."},403);const retained=(state.dailySubstitutions||[]).filter(r=>teachers.get(r.absentTeacherId)?.department!==account.department);state.dailySubstitutions=[...retained,...records]}else state.dailySubstitutions=records;
    const stamp=now();await env.DB.prepare("UPDATE app_state SET state_json=?,revision=revision+1,updated_at=?,updated_by=? WHERE state_key='main'").bind(JSON.stringify(state),stamp,who.userId).run();await audit(env.DB,who.userId,"update_substitutions",account.department||"all");return json({ok:true,updatedAt:stamp});
  }
  if(path==="/api/accounts"&&request.method==="GET"){const fullOnly=deny(account,true);if(fullOnly)return fullOnly;const rows=await env.DB.prepare("SELECT * FROM accounts ORDER BY is_primary DESC,display_name COLLATE NOCASE").all();return json({accounts:(rows.results||[]).map(cleanAccount)})}
  if(path==="/api/accounts"&&request.method==="POST"){
    const fullOnly=deny(account,true);if(fullOnly)return fullOnly;const data=await body(request),email=String(data?.email||"").trim().toLowerCase(),username=String(data?.username||"").trim(),displayName=String(data?.displayName||"").trim(),role=data?.role==="department"?"department":"full",department=role==="department"?String(data?.department||"").trim():null;
    if(!/^\S+@\S+\.\S+$/.test(email)||username.length<3||!displayName||(role==="department"&&!department))return json({error:"أكمل البريد واسم المستخدم والاسم والقسم بصورة صحيحة."},400);const stamp=now();
    try{await env.DB.prepare("INSERT INTO accounts (email,username,display_name,role,department,active,is_primary,created_at,updated_at) VALUES (?,?,?,?,?,1,0,?,?)").bind(email,username,displayName,role,department,stamp,stamp).run()}catch{return json({error:"البريد أو اسم المستخدم مسجل بالفعل."},409)}
    await audit(env.DB,who.userId,"create_account",`${email}:${role}:${department||""}`);return json({ok:true},201);
  }
  const match=path.match(/^\/api\/accounts\/(\d+)$/);
  if(match&&request.method==="PATCH"){
    const fullOnly=deny(account,true);if(fullOnly)return fullOnly;const id=Number(match[1]),existing=await env.DB.prepare("SELECT * FROM accounts WHERE id=?").bind(id).first();if(!existing)return json({error:"الحساب غير موجود."},404);const data=await body(request),active=data?.active===false?0:1,role=data?.role==="department"?"department":"full",department=role==="department"?String(data?.department||existing.department||"").trim():null;
    if(existing.is_primary&&(!active||role!=="full"))return json({error:"لا يمكن تعطيل المدير الأساسي أو تقليل صلاحياته."},400);if(role==="department"&&!department)return json({error:"اختر القسم للحساب المقيد."},400);await env.DB.prepare("UPDATE accounts SET role=?,department=?,active=?,updated_at=? WHERE id=?").bind(role,department,active,now(),id).run();await audit(env.DB,who.userId,"update_account",String(id));return json({ok:true});
  }
  if(match&&request.method==="DELETE"){
    const fullOnly=deny(account,true);if(fullOnly)return fullOnly;const id=Number(match[1]),existing=await env.DB.prepare("SELECT * FROM accounts WHERE id=?").bind(id).first();if(!existing)return json({error:"الحساب غير موجود."},404);if(existing.is_primary||existing.user_id===who.userId)return json({error:"لا يمكن حذف المدير الأساسي أو الحساب المستخدم حاليًا."},400);await env.DB.prepare("DELETE FROM accounts WHERE id=?").bind(id).run();await audit(env.DB,who.userId,"delete_account",String(id));return json({ok:true});
  }
  return json({error:"المسار غير موجود."},404);
}

function asset(path){let decoded=path;try{decoded=decodeURIComponent(path)}catch{}const normalized=decoded==="/"?"/index.html":decoded,encoded=EMBEDDED[normalized];if(!encoded)return new Response("Not found",{status:404});const binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const dot=normalized.slice(normalized.lastIndexOf("."));return new Response(bytes,{headers:{"content-type":MIME[dot]||"application/octet-stream","cache-control":dot===".html"?"no-store":"public, max-age=3600"}})}
export default{async fetch(request,env,ctx){void ctx;const path=new URL(request.url).pathname;if(path.startsWith("/api/"))return api(request,env,path);return asset(path)}};
