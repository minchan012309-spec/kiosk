begin;
-- Run once in Supabase SQL Editor. No service_role key belongs in the browser/app.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.club_profiles (
 id uuid primary key references auth.users(id), email text not null, display_name text not null,
 role text not null default 'staff' check(role in ('owner','admin','staff','viewer')),
 permissions text[] not null default array['dashboard.view'], active boolean not null default true
);
create table if not exists public.club_state(id int primary key check(id=1), data jsonb not null);
insert into public.club_state values(1,'{"settings":{"title":"PC CLUB","subtitle":"FESTIVAL EDITION","logoUrl":"","defaultTheme":"dark","initialSeconds":1800,"initialMoney":3000,"reservationSeconds":300},"seats":[],"kiosks":[],"devices":[],"sessions":[],"products":[],"extensions":[],"games":[],"orders":[],"commands":[],"exitRequests":[],"enrollments":[],"audit":[]}') on conflict do nothing;
create table if not exists public.club_receipts(actor text,action text,key uuid,body_hash text not null,result jsonb not null,primary key(actor,action,key));
create table if not exists public.club_exit_passwords(id uuid primary key default gen_random_uuid(),label text not null,hash text not null,active boolean not null default true);
create table if not exists public.club_limits(key text primary key,attempts int not null,until_ms bigint not null);
create table if not exists public.club_events(id int primary key check(id=1),revision bigint not null default 0);
insert into public.club_events values(1,0) on conflict do nothing;
alter table public.club_profiles enable row level security;
alter table public.club_state enable row level security;
alter table public.club_receipts enable row level security;
alter table public.club_exit_passwords enable row level security;
alter table public.club_limits enable row level security;
alter table public.club_events enable row level security;
drop policy if exists club_self_profile on public.club_profiles;
create policy club_self_profile on public.club_profiles for select to authenticated using(id=auth.uid());
drop policy if exists club_event_read on public.club_events;
create policy club_event_read on public.club_events for select to anon,authenticated using(true);
revoke all on public.club_state,public.club_receipts,public.club_exit_passwords,public.club_limits from anon,authenticated;
grant select on public.club_events to anon,authenticated;
grant select on public.club_profiles to authenticated;
create or replace function public.club_can(p_permission text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.club_profiles where id=auth.uid() and active and (role='owner' or (p_permission<>'accounts.manage' and p_permission=any(permissions))));
$$;
create or replace function public.club_find(s jsonb,k text,i text) returns jsonb language sql immutable set search_path=public as $$select value from jsonb_array_elements(s->k) where value->>'id'=i limit 1$$;
create or replace function public.club_put(s jsonb,k text,o jsonb) returns jsonb language sql immutable set search_path=public as $$
 select jsonb_set(s,array[k],case when exists(select 1 from jsonb_array_elements(s->k) where value->>'id'=o->>'id') then (select jsonb_agg(case when value->>'id'=o->>'id' then o else value end order by ord) from jsonb_array_elements(s->k) with ordinality t(value,ord)) else coalesce(s->k,'[]'::jsonb)||jsonb_build_array(o) end);
$$;
create or replace function public.club_session(s jsonb,seat text) returns jsonb language sql immutable set search_path=public as $$select value from jsonb_array_elements(s->'sessions') where value->>'seatId'=seat and value->>'status'='active' limit 1$$;
create or replace function public.club_seats(s jsonb,n bigint,private boolean default false) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(v || jsonb_build_object('online',exists(select 1 from jsonb_array_elements(s->'devices') d where d->>'seatId'=v->>'id' and (d->>'lastSeen')::bigint>n-15000),'session',(select jsonb_build_object('status',r->>'status') from jsonb_array_elements(s->'sessions')r where r->>'seatId'=v->>'id' and r->>'status'<>'ended' limit 1)) || case when private then jsonb_build_object('deviceId',(select d->>'id' from jsonb_array_elements(s->'devices')d where d->>'seatId'=v->>'id' limit 1)) else '{}'::jsonb end order by ord),'[]'::jsonb) from jsonb_array_elements(s->'seats') with ordinality t(v,ord);
$$;
create or replace function public.club_call(p_action text,p_payload jsonb default '{}'::jsonb,p_token text default null,p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
#variable_conflict use_column
declare s jsonb; original jsonb; result jsonb='{}'; n bigint=(extract(epoch from clock_timestamp())*1000)::bigint;
 d jsonb; r jsonb; v jsonb; x jsonb; item jsonb; profile jsonb; perm text; target text; code text; v_actor text='kiosk'; k text; digest_body text; old_hash text;
 amount bigint; seconds bigint; price bigint; stock bigint; version bigint; signal boolean=true; a text=p_action; new_id text; rows jsonb;
begin
 if length(p_action)>200 or octet_length(p_payload::text)>1000000 then raise exception '잘못된 요청입니다.'; end if;
 select data into s from public.club_state where id=1 for update; original=s;
 for r in select value from jsonb_array_elements(s->'sessions') loop
  if (r->>'status'='reserved' and (r->>'expiresAt')::bigint<=n) or (r->>'status'='active' and (r->>'endAt')::bigint<=n) then s=public.club_put(s,'sessions',r||'{"status":"ended","codeHash":""}'); end if;
 end loop;
 for v in select value from jsonb_array_elements(s->'commands') loop
  if v->>'status'='pending' and (v->>'expiresAt')::bigint<=n then s=public.club_put(s,'commands',v||'{"status":"expired"}'); end if;
 end loop;
 for v in select value from jsonb_array_elements(s->'exitRequests') loop
  if v->>'status'='pending' and (v->>'expiresAt')::bigint<=n then s=public.club_put(s,'exitRequests',v||'{"status":"expired"}'); end if;
 end loop;
 if a like '/admin/%' then
  perm=case when a='/admin/state' then 'dashboard.view' when a like '/admin/kiosks/%' then 'seats.manage' when a like '/admin/accounts%' then 'accounts.manage' when a like '/admin/exit-passwords%' then 'settings.manage' when a='/admin/settings' then 'settings.manage' when a like '/admin/devices/%/restart' then 'pc.shutdown' when a='/admin/devices/enrollment' then 'seats.manage' when a like '/admin/seats%' then 'seats.manage' when a like '/admin/sessions/%/adjust' then 'session.adjust' when a like '/admin/sessions/%/end' then 'session.end' when a like '/admin/orders/%' then 'orders.manage' when a like '/admin/exit-requests/%' then 'exit.approve' when a='/admin/products' or a='/admin/extensions' then 'catalog.manage' when a='/admin/games' then 'games.manage' when a='/admin/personal-data/purge' then 'privacy.purge' else null end;
  if perm is null or not public.club_can(perm) then raise exception '권한이 없습니다. 관리자 계정과 권한을 확인하세요.'; end if;
  v_actor=auth.uid()::text;
 elsif a like '/device/%' and a<>'/device/enroll' then
  select value into d from jsonb_array_elements(s->'devices') where value->>'tokenHash'=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') limit 1;
  if d is null then raise exception '등록된 PC 인증이 필요합니다. PC를 다시 등록하세요.'; end if; v_actor=d->>'id';
 end if;
 if a='/reservations' then
  select value into v from jsonb_array_elements(coalesce(s->'kiosks','[]')) where value->>'tokenHash'=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') limit 1;
  if v is null then raise exception '운영자가 이 키오스크를 먼저 등록해야 합니다.';end if;v_actor='kiosk:'||(v->>'id');
 end if;
 if a in ('/reservations','/device/orders','/device/extensions') or a like '/admin/sessions/%/adjust' or a like '/admin/orders/%' then
  if p_request_id is null then raise exception '요청 번호가 필요합니다.'; end if;
  digest_body=encode(extensions.digest(p_payload::text,'sha256'),'hex');
  select body_hash,club_receipts.result into old_hash,result from public.club_receipts where club_receipts.actor=v_actor and action=a and key=p_request_id;
  if found then if old_hash<>digest_body then raise exception '같은 요청 번호에 다른 내용을 사용할 수 없습니다.'; end if; return result; end if;
 end if;
 target=split_part(a,'/',4);
 if a='/public/state' then
  signal=false; result=jsonb_build_object('settings',s->'settings','seats',public.club_seats(s,n),'products',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(s->'products')v where coalesce((v->>'enabled')::boolean,true)),'extensions',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(s->'extensions')v where coalesce((v->>'enabled')::boolean,true)),'games',(select coalesce(jsonb_agg(jsonb_build_object('id',v->>'id','name',v->>'name','description',v->>'description','imageUrl',v->>'imageUrl')),'[]') from jsonb_array_elements(s->'games')v where coalesce((v->>'enabled')::boolean,true)),'serverNow',n);
 elsif a='/admin/state' then
  signal=false; select to_jsonb(p) into profile from public.club_profiles p where p.id=auth.uid();
  result=s-'devices'-'enrollments'-'kiosks'||jsonb_build_object('profile',profile,'seats',public.club_seats(s,n,true),'sessions',(select coalesce(jsonb_agg(case when public.club_can('visitors.view') then v-'codeHash' else v-'codeHash'-'studentId'-'name'||'{"name":"비공개","studentId":""}' end),'[]') from jsonb_array_elements(s->'sessions')v),'games',case when public.club_can('games.manage') then s->'games' else '[]'::jsonb end,'orders',case when public.club_can('orders.manage') then s->'orders' else '[]'::jsonb end,'audit',case when public.club_can('audit.view') then (select coalesce(jsonb_agg(v order by ord desc),'[]') from jsonb_array_elements(s->'audit') with ordinality t(v,ord)) else '[]'::jsonb end,'exitPasswords',case when public.club_can('settings.manage') then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'active',active)),'[]') from public.club_exit_passwords) else '[]'::jsonb end,'accounts',case when public.club_can('accounts.manage') then (select coalesce(jsonb_agg(to_jsonb(p) order by email),'[]') from public.club_profiles p) else '[]'::jsonb end,'serverNow',n);
 elsif a='/admin/accounts/save' then
  if p_payload->>'role' not in ('owner','admin','staff','viewer') then raise exception '역할이 올바르지 않습니다.'; end if;
  if exists(select 1 from public.club_profiles where id=(p_payload->>'id')::uuid and role='owner' and active) and (p_payload->>'role'<>'owner' or not (p_payload->>'active')::boolean) and (select count(*) from public.club_profiles where role='owner' and active)<=1 then raise exception '마지막 소유자는 비활성화하거나 권한을 변경할 수 없습니다.'; end if;
  if not exists(select 1 from auth.users where id=(p_payload->>'id')::uuid) then raise exception '인증 계정이 없습니다.'; end if;
  insert into public.club_profiles(id,email,display_name,role,permissions,active) values((p_payload->>'id')::uuid,p_payload->>'email',left(p_payload->>'display_name',100),p_payload->>'role',array(select jsonb_array_elements_text(p_payload->'permissions')),(p_payload->>'active')::boolean) on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,permissions=excluded.permissions,active=excluded.active;
  result='{"ok":true}';
 elsif a='/admin/exit-passwords' then
  if length(p_payload->>'password')<6 or length(p_payload->>'password')>128 then raise exception '종료 비밀번호는 6~128자로 설정하세요.'; end if;
  insert into public.club_exit_passwords(label,hash) values(left(p_payload->>'label',100),extensions.crypt(p_payload->>'password',extensions.gen_salt('bf',10))); result='{"ok":true}';
 elsif a like '/admin/exit-passwords/%' then
  update public.club_exit_passwords set active=false where id=target::uuid; result='{"ok":true}';
 elsif a='/admin/settings' then
  if not (p_payload ?& array['title','initialSeconds','initialMoney','reservationSeconds']) or length(trim(p_payload->>'title')) not between 1 and 100 or (p_payload->>'initialSeconds')::int not between 60 and 86400 or (p_payload->>'initialMoney')::int not between 0 and 1000000 or (p_payload->>'reservationSeconds')::int not between 60 and 3600 then raise exception '운영 설정 값을 확인하세요.'; end if;
  if p_payload ? 'logoUrl' and coalesce(p_payload->>'logoUrl','')<>'' and (p_payload->>'logoUrl') not like 'https://gtvgeqdxcoiplhhufvgg.supabase.co/storage/v1/object/public/club-branding/%' then raise exception '로고는 로고 업로드 기능을 사용하세요.'; end if;
  if p_payload ? 'defaultTheme' and p_payload->>'defaultTheme' not in ('light','dark','system') then raise exception '테마 값이 올바르지 않습니다.'; end if;
  s=jsonb_set(s,'{settings}',s->'settings'||p_payload);result=s->'settings';
 elsif a='/admin/seats/layout' then
  if jsonb_typeof(p_payload->'seats') is distinct from 'array' or jsonb_array_length(p_payload->'seats')<>jsonb_array_length(s->'seats') then raise exception '좌석 목록이 변경됐습니다. 새로고침하고 배치하세요.';end if;
  if (select coalesce(jsonb_agg(value->'id' order by ord),'[]') from jsonb_array_elements(s->'seats') with ordinality t(value,ord)) is distinct from p_payload->'expectedIds' then raise exception '다른 관리자가 좌석 목록을 변경했습니다. 새로고침하세요.';end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_payload->'seats'))<>jsonb_array_length(s->'seats') then raise exception '중복 좌석이 있습니다.';end if;
  rows='[]'::jsonb;
  for v in select value from jsonb_array_elements(p_payload->'seats') loop
   item=public.club_find(s,'seats',v->>'id');
   if item is null or (v->>'row') is null or (v->>'col') is null or (v->>'row')::int not between 1 and 24 or (v->>'col')::int not between 1 and 24 then raise exception '배치는 1~24행/열 안에서 설정하세요.';end if;
   if exists(select 1 from jsonb_array_elements(rows)x where (x->>'row')::int=(v->>'row')::int and (x->>'col')::int=(v->>'col')::int) then raise exception '좌석이 겹칩니다. 빈칸에 배치하세요.';end if;
   rows=rows||jsonb_build_array(item||jsonb_build_object('row',(v->>'row')::int,'col',(v->>'col')::int));
  end loop;
  s=jsonb_set(s,'{seats}',rows);result=jsonb_build_object('ok',true);
 elsif a like '/admin/seats/%/delete' then
  if public.club_find(s,'seats',target) is null then raise exception '좌석이 없습니다.';end if;
  if exists(select 1 from jsonb_array_elements(s->'sessions')x where x->>'seatId'=target and x->>'status'<>'ended') then raise exception '배정/이용 중인 좌석은 먼저 이용을 종료하세요.';end if;
  for k in select unnest(array['seats','devices','enrollments']) loop
   s=jsonb_set(s,array[k],(select coalesce(jsonb_agg(x order by ord),'[]') from jsonb_array_elements(s->k) with ordinality t(x,ord) where case when k='seats' then x->>'id'<>target else coalesce(x->>'seatId','')<>target end));
  end loop;
  result=jsonb_build_object('ok',true);
 elsif a='/admin/seats' then
  if length(coalesce(trim(p_payload->>'name'),'')) not between 1 and 30 then raise exception '좌석 이름을 입력하세요.'; end if;
  if exists(select 1 from jsonb_array_elements(s->'seats')v where v->>'name'=trim(p_payload->>'name')) then raise exception '같은 이름의 좌석이 있습니다.'; end if;
  select greatest(6,coalesce(max((x->>'col')::int),6)) into version from jsonb_array_elements(s->'seats')x;
  select g into amount from generate_series(0,(version*24-1)::int)g where not exists(select 1 from jsonb_array_elements(s->'seats') with ordinality t(x,ord) where coalesce((x->>'row')::int,((ord-1)/6)::int+1)=g/version+1 and coalesce((x->>'col')::int,((ord-1)%6)::int+1)=g%version+1) order by g limit 1;
  if amount is null then raise exception '자리 배치 공간이 가득 찼습니다.';end if;
  result=jsonb_build_object('id',gen_random_uuid()::text,'name',trim(p_payload->>'name'),'enabled',true,'row',amount/version+1,'col',amount%version+1);s=public.club_put(s,'seats',result);
 elsif a like '/admin/seats/%' then
  v=public.club_find(s,'seats',target);if v is null then raise exception '좌석이 없습니다.'; end if;v=v||jsonb_build_object('enabled',(p_payload->>'enabled')::boolean);s=public.club_put(s,'seats',v);result=v;
 elsif a='/admin/kiosks/enrollment' then
  code=upper(encode(extensions.gen_random_bytes(6),'hex'));new_id=gen_random_uuid()::text;s=public.club_put(s,'enrollments',jsonb_build_object('id',new_id,'type','kiosk','codeHash',encode(extensions.digest(code,'sha256'),'hex'),'expiresAt',n+600000));result=jsonb_build_object('code',code,'expiresAt',n+600000);
 elsif a='/kiosk/enroll' then
  select value into v from jsonb_array_elements(s->'enrollments') where value->>'type'='kiosk' and value->>'codeHash'=encode(extensions.digest(upper(trim(p_payload->>'code')),'sha256'),'hex') and (value->>'expiresAt')::bigint>n limit 1;
  if v is null then raise exception '키오스크 연결 코드가 만료됐거나 사용됐습니다.';end if;
  s=jsonb_set(s,'{enrollments}',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s->'enrollments')x where x->>'id'<>v->>'id'));code=encode(extensions.gen_random_bytes(32),'hex');s=public.club_put(s,'kiosks',jsonb_build_object('id',v->>'id','tokenHash',encode(extensions.digest(code,'sha256'),'hex')));result=jsonb_build_object('token',code);
 elsif a='/admin/devices/enrollment' then
  target=p_payload->>'seatId';if public.club_find(s,'seats',target) is null then raise exception '좌석이 없습니다.'; end if;
  if exists(select 1 from jsonb_array_elements(s->'sessions')v where v->>'seatId'=target and v->>'status'<>'ended') then raise exception '사용 중인 좌석은 재등록할 수 없습니다.'; end if;
  code=upper(encode(extensions.gen_random_bytes(6),'hex'));result=jsonb_build_object('code',code,'expiresAt',n+600000);s=public.club_put(s,'enrollments',jsonb_build_object('id',target,'seatId',target,'codeHash',encode(extensions.digest(code,'sha256'),'hex'),'expiresAt',n+600000));
 elsif a='/device/enroll' then
  select value into v from jsonb_array_elements(s->'enrollments') where coalesce(value->>'type','device')='device' and value->>'codeHash'=encode(extensions.digest(upper(trim(p_payload->>'code')),'sha256'),'hex') and (value->>'expiresAt')::bigint>n limit 1;
  if v is null then raise exception '등록 코드가 만료됐거나 사용됐습니다.'; end if;
  s=jsonb_set(s,'{enrollments}',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s->'enrollments')x where x->>'id'<>v->>'id'));
  s=jsonb_set(s,'{devices}',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s->'devices')x where x->>'seatId'<>v->>'seatId'));
  code=encode(extensions.gen_random_bytes(32),'hex');k=upper(encode(extensions.gen_random_bytes(12),'hex'));new_id=gen_random_uuid()::text;
  d=jsonb_build_object('id',new_id,'seatId',v->>'seatId','tokenHash',encode(extensions.digest(code,'sha256'),'hex'),'lastSeen',n);s=public.club_put(s,'devices',d);
  result=jsonb_build_object('token',code,'deviceId',new_id,'seatId',v->>'seatId','recoveryCode',k,'recoveryHash',extensions.crypt(k,extensions.gen_salt('bf',10)));
 elsif a='/device/heartbeat' then
  signal=coalesce((d->>'lastSeen')::bigint,0)<n-15000;s=public.club_put(s,'devices',d||jsonb_build_object('lastSeen',n,'protocol',coalesce((p_payload->>'protocol')::int,1)));result=jsonb_build_object('deviceId',d->>'id');
 elsif a='/reservations' then
  target=p_payload->>'seatId';v=public.club_find(s,'seats',target);
  if v is null or not (v->>'enabled')::boolean or not exists(select 1 from jsonb_array_elements(s->'devices')x where x->>'seatId'=target and (x->>'lastSeen')::bigint>n-15000) then raise exception '사용할 수 없거나 연결되지 않은 좌석입니다.'; end if;
  if exists(select 1 from jsonb_array_elements(s->'sessions')x where x->>'seatId'=target and x->>'status'<>'ended') then raise exception '이미 배정된 좌석입니다.'; end if;
  if length(trim(p_payload->>'name')) not between 1 and 100 or length(trim(p_payload->>'studentId')) not between 1 and 30 then raise exception '이름과 학번을 확인하세요.'; end if;
  if coalesce(p_payload->>'password','') !~ '^[0-9]{4,6}$' then raise exception '비밀번호는 숫자 4~6자리로 설정하세요.';end if;new_id=gen_random_uuid()::text;
  r=jsonb_build_object('id',new_id,'seatId',target,'name',trim(p_payload->>'name'),'studentId',trim(p_payload->>'studentId'),'codeHash',extensions.crypt(p_payload->>'password',extensions.gen_salt('bf',10)),'money',(s->'settings'->>'initialMoney')::bigint,'seconds',(s->'settings'->>'initialSeconds')::int,'createdAt',n,'expiresAt',n+(s->'settings'->>'reservationSeconds')::int*1000,'endAt',null,'status','reserved');s=public.club_put(s,'sessions',r);result=(r-'name'-'studentId'-'codeHash');
 elsif a='/device/login' or a='/device/exit-password' then
  k=v_actor||':'||a;insert into public.club_limits values(k,1,n+60000) on conflict(key) do update set attempts=case when club_limits.until_ms<=n then 1 else club_limits.attempts+1 end,until_ms=case when club_limits.until_ms<=n then n+60000 else club_limits.until_ms end returning attempts into amount;
  -- Failed authentication returns a normal RPC object so rate-limit increments commit.
  if amount>10 then result=jsonb_build_object('error','시도 횟수가 많습니다. 1분 후 다시 시도하세요.');
  elsif a='/device/login' then
   select value into r from jsonb_array_elements(s->'sessions') where value->>'seatId'=d->>'seatId' and value->>'status'='reserved' and value->>'codeHash'=case when value->>'status'='reserved' then extensions.crypt(coalesce(p_payload->>'password',''),value->>'codeHash') else null end limit 1;
   if r is null then result=jsonb_build_object('error','비밀번호를 확인해 주세요.'); else r=r||jsonb_build_object('status','active','codeHash','','endAt',n+(r->>'seconds')::bigint*1000);s=public.club_put(s,'sessions',r);result=r-'codeHash';end if;
  else
   if not exists(select 1 from public.club_exit_passwords where active and hash=extensions.crypt(coalesce(p_payload->>'password',''),hash)) then result=jsonb_build_object('error','종료 승인 비밀번호가 다릅니다.');else result=jsonb_build_object('id',gen_random_uuid()::text,'deviceId',d->>'id','type','exit','status','pending','expiresAt',n+60000);s=public.club_put(s,'commands',result);end if;
  end if;
 elsif a='/device/state' then
  signal=false;r=public.club_session(s,d->>'seatId');result=jsonb_build_object('settings',s->'settings','device',jsonb_build_object('id',d->>'id','seatId',d->>'seatId','seatName',public.club_find(s,'seats',d->>'seatId')->>'name'),'session',r-'codeHash','reservation',(select x-'codeHash'-'studentId' from jsonb_array_elements(s->'sessions')x where x->>'seatId'=d->>'seatId' and x->>'status'='reserved' limit 1),'products',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s->'products')x where (x->>'enabled')::boolean),'extensions',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s->'extensions')x where (x->>'enabled')::boolean),'games',(select coalesce(jsonb_agg(x-'paths'||jsonb_build_object('executable',coalesce(nullif(x->'paths'->>(d->>'seatId'),''),x->>'executable'))),'[]') from jsonb_array_elements(s->'games')x where (x->>'enabled')::boolean),'orders',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s->'orders')x where x->>'sessionId'=r->>'id'),'commands',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s->'commands')x where x->>'deviceId'=d->>'id' and x->>'status'='pending'),'exitRequests',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(s->'exitRequests')x where x->>'deviceId'=d->>'id'),'serverNow',n);
 elsif a in ('/admin/products','/admin/extensions','/admin/games') then
  k=split_part(a,'/',3);new_id=coalesce(p_payload->>'id',gen_random_uuid()::text);item=public.club_find(s,k,new_id);
  if length(trim(p_payload->>'name')) not between 1 and 100 then raise exception '이름을 확인하세요.'; end if;
  v=p_payload||jsonb_build_object('id',new_id,'enabled',coalesce((p_payload->>'enabled')::boolean,true));
  if k<>'games' then price=(p_payload->>'price')::bigint;if price is null or price not between 0 and 1000000 then raise exception '가격을 확인하세요.';end if;
   if k='products' then stock=(p_payload->>'stock')::bigint;if stock is null or stock not between 0 and 1000000 then raise exception '재고를 확인하세요.';end if;if item is not null and (p_payload->>'version')::bigint is distinct from (item->>'version')::bigint then raise exception '상품 또는 재고가 변경됐습니다. 다시 열어 수정하세요.';end if;v=v||jsonb_build_object('version',coalesce((item->>'version')::bigint,0)+1);
   elsif (p_payload->>'seconds') is null or (p_payload->>'seconds')::bigint not between 60 and 86400 then raise exception '연장 시간을 확인하세요.';end if;
  else if length(coalesce(v->>'executable',''))>1000 or jsonb_typeof(coalesce(v->'args','[]'))<>'array' or jsonb_array_length(coalesce(v->'args','[]'))>20 then raise exception '실행 경로와 인수를 확인하세요.';end if;end if;
  if coalesce(v->>'imageUrl','')<>'' and (length(v->>'imageUrl')>2000 or (v->>'imageUrl') not like ('https://gtvgeqdxcoiplhhufvgg.supabase.co/storage/v1/object/public/club-media/'||k||'/%')) then raise exception '미리보기 이미지는 이미지 업로드 기능으로 등록하세요.';end if;
  s=public.club_put(s,k,v);result=v;
 elsif a='/device/orders' or a='/device/extensions' then
  r=public.club_session(s,d->>'seatId');if r is null then raise exception '진행 중인 이용 시간이 없습니다.';end if;
  k=case when a='/device/orders' then 'products' else 'extensions' end;item=public.club_find(s,k,p_payload->>(case when k='products' then 'productId' else 'extensionId' end));
  if item is null or not (item->>'enabled')::boolean then raise exception '구매할 수 없는 상품입니다.';end if;price=(item->>'price')::bigint;if (r->>'money')::bigint<price then raise exception '머니가 부족합니다.';end if;
  r=r||jsonb_build_object('money',(r->>'money')::bigint-price);
  if k='products' then if (item->>'stock')::bigint<1 then raise exception '품절 상품입니다.';end if;item=item||jsonb_build_object('stock',(item->>'stock')::bigint-1,'version',(item->>'version')::bigint+1);s=public.club_put(s,'products',item);result=jsonb_build_object('id',gen_random_uuid()::text,'sessionId',r->>'id','seatId',r->>'seatId','productId',item->>'id','name',item->>'name','price',price,'status','received','createdAt',n);s=public.club_put(s,'orders',result);
  else r=r||jsonb_build_object('endAt',(r->>'endAt')::bigint+(item->>'seconds')::bigint*1000);result=jsonb_build_object('id',r->>'id','money',r->'money','endAt',r->'endAt');end if;s=public.club_put(s,'sessions',r);
 elsif a like '/admin/sessions/%/adjust' then
  r=public.club_find(s,'sessions',target);amount=(p_payload->>'money')::bigint;seconds=(p_payload->>'seconds')::bigint;
  if r is null or r->>'status'='ended' or amount is null or seconds is null or amount not between -1000000 and 1000000 or seconds not between -86400 and 86400 or (r->>'money')::bigint+amount<0 then raise exception '이용 상태와 조정 값을 확인하세요.';end if;
  if amount<>0 and not public.club_can('money.adjust') then raise exception '머니 조정 권한이 없습니다.';end if;if seconds<>0 and not public.club_can('time.adjust') then raise exception '시간 조정 권한이 없습니다.';end if;
  r=r||jsonb_build_object('money',(r->>'money')::bigint+amount);if r->>'status'='active' then r=r||jsonb_build_object('endAt',greatest(n,(r->>'endAt')::bigint+seconds*1000));else if (r->>'seconds')::bigint+seconds<0 then raise exception '시간이 음수입니다.';end if;r=r||jsonb_build_object('seconds',(r->>'seconds')::bigint+seconds);end if;
  s=public.club_put(s,'sessions',r);result=jsonb_build_object('id',r->>'id','money',r->'money','endAt',r->'endAt');
 elsif a like '/admin/sessions/%/end' or a='/device/end' then
  if a='/device/end' then target=p_payload->>'sessionId';end if;r=public.club_find(s,'sessions',target);if r is null or (a='/device/end' and r->>'seatId'<>d->>'seatId') then raise exception '종료할 세션을 확인하세요.';end if;s=public.club_put(s,'sessions',r||'{"status":"ended","codeHash":""}');result='{"ok":true}';
 elsif a like '/admin/orders/%' then
  item=public.club_find(s,'orders',target);if item is null then raise exception '주문이 없습니다.';end if;code=p_payload->>'status';
  if code='cancelled' and item->>'status'<>'cancelled' then r=public.club_find(s,'sessions',item->>'sessionId');s=public.club_put(s,'sessions',r||jsonb_build_object('money',(r->>'money')::bigint+(item->>'price')::bigint));v=public.club_find(s,'products',item->>'productId');if v is not null then s=public.club_put(s,'products',v||jsonb_build_object('stock',(v->>'stock')::bigint+1,'version',(v->>'version')::bigint+1));end if;
  elsif not ((item->>'status'='received' and code='preparing') or (item->>'status'='preparing' and code='delivered') or item->>'status'=code) then raise exception '주문 상태를 변경할 수 없습니다.';end if;item=item||jsonb_build_object('status',code);s=public.club_put(s,'orders',item);result=item;
 elsif a='/device/exit-requests' then
  select value into result from jsonb_array_elements(s->'exitRequests') where value->>'deviceId'=d->>'id' and value->>'status'='pending' limit 1;
  if result is not null and p_payload ? 'reason' then result=result||jsonb_build_object('reason',left(p_payload->>'reason',80));s=public.club_put(s,'exitRequests',result);end if;
  if result is null then result=jsonb_build_object('id',gen_random_uuid()::text,'deviceId',d->>'id','seatId',d->>'seatId','status','pending','reason',left(coalesce(p_payload->>'reason','종료 승인 요청'),80),'expiresAt',n+120000);s=public.club_put(s,'exitRequests',result);end if;
 elsif a like '/admin/exit-requests/%' then
  v=public.club_find(s,'exitRequests',target);if v is null or v->>'status'<>'pending' or (v->>'expiresAt')::bigint<=n then raise exception '승인 요청이 만료됐거나 처리됐습니다.';end if;
  if (p_payload->>'approve')::boolean then item=public.club_find(s,'devices',v->>'deviceId');if item is null or (item->>'lastSeen')::bigint<n-15000 then raise exception 'PC가 오프라인입니다.';end if;item=jsonb_build_object('id',gen_random_uuid()::text,'deviceId',v->>'deviceId','type','exit','status','pending','expiresAt',n+60000);s=public.club_put(s,'commands',item);v=v||'{"status":"approved"}';else v=v||'{"status":"rejected"}';end if;s=public.club_put(s,'exitRequests',v);result=v;
 elsif a like '/admin/devices/%/restart' then
  v=public.club_find(s,'devices',target);if v is null or (v->>'lastSeen')::bigint<n-15000 or coalesce((p_payload->>'confirm')::boolean,false)=false then raise exception '연결 상태와 재부팅 확인을 확인하세요.';end if;
  if coalesce((v->>'protocol')::int,1)<2 then raise exception '이 PC의 Station을 1.2 이상으로 업데이트한 뒤 재부팅하세요.';end if;
  select value into result from jsonb_array_elements(s->'commands') where value->>'deviceId'=target and value->>'type'='restart' and value->>'status' in ('pending','accepted') and (value->>'expiresAt')::bigint>n limit 1;
  if result is null then result=jsonb_build_object('id',gen_random_uuid()::text,'deviceId',target,'type','restart','status','pending','expiresAt',n+60000);s=public.club_put(s,'commands',result);end if;
 elsif a like '/device/commands/%/ack' then
  item=public.club_find(s,'commands',target);code=p_payload->>'status';if item is null or item->>'deviceId'<>d->>'id' or (item->>'expiresAt')::bigint<=n or not(item->>'status'='pending' or (item->>'status'='accepted' and code='failed')) or code not in ('accepted','failed') then raise exception '명령이 만료됐거나 처리됐습니다.';end if;
  s=public.club_put(s,'commands',item||jsonb_build_object('status',code,'message',left(coalesce(p_payload->>'message',''),200)));if code='accepted' then for r in select value from jsonb_array_elements(s->'sessions') where value->>'seatId'=d->>'seatId' and value->>'status'<>'ended' loop s=public.club_put(s,'sessions',r||'{"status":"ended","codeHash":""}');end loop;end if;result='{"ok":true}';
 elsif a='/admin/personal-data/purge' then
  for r in select value from jsonb_array_elements(s->'sessions') where value->>'status'='ended' loop s=public.club_put(s,'sessions',r||'{"name":"삭제됨","studentId":"","codeHash":""}');end loop;
  result='{"ok":true}';
 else raise exception '지원하지 않는 요청입니다: %',a;
 end if;
 if digest_body is not null then insert into public.club_receipts values(v_actor,a,p_request_id,digest_body,result);end if;
 if signal and a not in ('/device/heartbeat','/public/state','/device/state','/admin/state') then s=jsonb_set(s,'{audit}',coalesce(s->'audit','[]')||jsonb_build_array(jsonb_build_object('at',n,'action',a,'target',coalesce(target,''),'detail',case when a like '%/adjust' then p_payload::text when a='/device/exit-requests' then left(coalesce(p_payload->>'reason','종료 승인 요청'),80) else v_actor end)));end if;
 if jsonb_array_length(s->'audit')>1000 then s=jsonb_set(s,'{audit}',(select jsonb_agg(v order by ord) from (select v,ord from jsonb_array_elements(s->'audit') with ordinality t(v,ord) order by ord desc limit 1000)q));end if;
 if s is distinct from original then update public.club_state set data=s where id=1;end if;
 if signal or (s is distinct from original and a not in ('/device/heartbeat')) then update public.club_events set revision=revision+1 where id=1;end if;
 return result;
end $$;
-- Helpers are internal. Only the dispatch RPC and permission check are callable.
revoke all on function public.club_find(jsonb,text,text),public.club_put(jsonb,text,jsonb),public.club_session(jsonb,text),public.club_seats(jsonb,bigint,boolean) from public,anon,authenticated;
revoke all on function public.club_call(text,jsonb,text,uuid),public.club_can(text) from public;
grant execute on function public.club_call(text,jsonb,text,uuid) to anon,authenticated;
grant execute on function public.club_can(text) to authenticated;
do $$begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='club_events') then alter publication supabase_realtime add table public.club_events;end if;end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('club-branding','club-branding',true,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists club_logo_upload on storage.objects;
create policy club_logo_upload on storage.objects for insert to authenticated with check(bucket_id='club-branding' and public.club_can('settings.manage'));
drop policy if exists club_logo_delete on storage.objects;
create policy club_logo_delete on storage.objects for delete to authenticated using(bucket_id='club-branding' and public.club_can('settings.manage'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('club-media','club-media',true,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists club_media_upload on storage.objects;
create policy club_media_upload on storage.objects for insert to authenticated with check(bucket_id='club-media' and (((storage.foldername(name))[1]='products' and public.club_can('catalog.manage')) or ((storage.foldername(name))[1]='games' and public.club_can('games.manage'))));

commit;
