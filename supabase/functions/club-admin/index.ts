// Deploy as Supabase Edge Function "club-admin". service_role stays in function secrets.
import { createClient } from 'npm:@supabase/supabase-js@2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
 try{
  if(req.method!=='POST')return reply({error:'POST 요청만 지원합니다.'},405);
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!jwt)return reply({error:'로그인이 필요합니다.'},401);
  const {data:{user},error}=await admin.auth.getUser(jwt);if(error||!user)return reply({error:'로그인이 만료됐습니다.'},401);
  const {data:profile}=await admin.from('club_profiles').select('*').eq('id',user.id).single();
  if(!profile?.active||profile.role!=='owner')return reply({error:'계정 관리는 소유자만 가능합니다.'},403);
  const body=await req.json();if(typeof body.password!=='string'||body.password.length<10||body.password.length>128)return reply({error:'비밀번호는 10~128자로 설정하세요.'},400);
  if(body.action==='reset-password'){
   const {data:target}=await admin.from('club_profiles').select('id').eq('id',body.id).single();if(!target)return reply({error:'대상 계정이 없습니다.'},404);
   const {error}=await admin.auth.admin.updateUserById(body.id,{password:body.password});if(error)throw error;return reply({ok:true});
  }
  if(body.action!=='create'||typeof body.email!=='string'||!body.email.includes('@')||typeof body.display_name!=='string'||!body.display_name.trim()||!['owner','admin','staff','viewer'].includes(body.role)||!Array.isArray(body.permissions)||body.permissions.some((p:unknown)=>typeof p!=='string'||p.length>80))return reply({error:'계정 입력 내용을 확인하세요.'},400);
  const {data:created,error:createError}=await admin.auth.admin.createUser({email:body.email.trim(),password:body.password,email_confirm:true});if(createError)throw createError;
  // Forward the caller's identity to the transactional permission RPC.
  const caller=createClient(url,(req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY')!),{global:{headers:{Authorization:'Bearer '+jwt}},auth:{persistSession:false}});
  const {error:saveError}=await caller.rpc('club_call',{p_action:'/admin/accounts/save',p_payload:{id:created.user.id,email:created.user.email,display_name:body.display_name,role:body.role,permissions:body.permissions,active:true}});
  if(saveError){await admin.auth.admin.deleteUser(created.user.id);throw saveError;}
  return reply({ok:true,id:created.user.id});
 }catch(e){return reply({error:e instanceof Error?e.message:'계정 처리 중 오류가 발생했습니다.'},400);}
});
