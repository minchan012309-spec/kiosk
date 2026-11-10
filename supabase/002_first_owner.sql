-- 1. Supabase Dashboard → Authentication → Users → Add user: create your own email/password.
-- 2. Replace the email below with that user's email, then run in SQL Editor.
-- Never put passwords or service_role keys in this file.
do $$
declare owner_email text := 'YOUR_OWNER_EMAIL@example.com'; owner_id uuid;
begin
 select id into owner_id from auth.users where lower(email)=lower(owner_email);
 if owner_id is null then raise exception '먼저 Authentication → Users에서 해당 이메일 계정을 생성하세요.'; end if;
 insert into public.club_profiles(id,email,display_name,role,permissions,active)
 values(owner_id,owner_email,'최고 관리자','owner',array['dashboard.view'],true)
 on conflict(id) do update set role='owner',active=true;
end $$;
