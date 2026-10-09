-- Repairs accounts created before the schema (or its new-user trigger) was in place.
-- Safe to run more than once. Run in the Supabase SQL Editor.

-- 1. Make sure the trigger exists and points at the current function.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Create the missing profile and subscription rows for existing users.
insert into public.profiles (id, email, terms_accepted_at)
select u.id,
       coalesce(u.email, ''),
       nullif(u.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.subscriptions (user_id)
select p.id
from public.profiles p
where not exists (select 1 from public.subscriptions s where s.user_id = p.id);

-- 3. Check: both numbers should be 0.
select
  (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)) as users_without_profile,
  (select count(*) from public.profiles p where not exists (select 1 from public.subscriptions s where s.user_id = p.id)) as profiles_without_subscription;
