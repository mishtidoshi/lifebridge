-- Turn on end-to-end encryption for an existing LifeBridge project.
-- Run once (Dashboard → SQL Editor → New query → paste → Run), after schema.sql.
-- New projects can skip this: schema.sql already includes it.
--
-- After this, Supabase only stores scrambled data for each plan and each name. The app locks
-- it on the device with a key made from the person's password (mobile/src/lib/crypto.ts).

-- 1. Saved plans: one encrypted payload instead of readable answers and progress.
--    Any plans saved before encryption were readable, so they're deleted.
delete from public.saved_plans;
alter table public.saved_plans drop column if exists facts;
alter table public.saved_plans drop column if exists progress;
alter table public.saved_plans add column if not exists payload text not null default '';

-- 2. Each account's vault: scrypt settings, the locked data key, and the encrypted name.
create table if not exists public.user_vaults (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  kdf         jsonb       not null,              -- {"alg":"scrypt","N":32768,"r":8,"p":1,"salt":"..."}
  wrapped_key text        not null,              -- the data key, locked with the password key
  profile     text        not null default '',   -- encrypted {"first": "...", "last": "..."}
  updated_at  timestamptz not null default now()
);

alter table public.user_vaults enable row level security;

drop policy if exists "Read own vault" on public.user_vaults;
create policy "Read own vault" on public.user_vaults
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Add own vault" on public.user_vaults;
create policy "Add own vault" on public.user_vaults
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own vault" on public.user_vaults;
create policy "Update own vault" on public.user_vaults
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own vault" on public.user_vaults;
create policy "Delete own vault" on public.user_vaults
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3. Names now live (encrypted) in the vault. Erase readable names left in account info.
--    (A name typed at sign-up waits there until the first sign-in, which moves it into the vault.)
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'first_name' - 'last_name'
where raw_user_meta_data ? 'first_name' or raw_user_meta_data ? 'last_name';
