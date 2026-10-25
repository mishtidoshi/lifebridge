create table if not exists public.saved_plans (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  pack_id    text        not null,
  facts      jsonb       not null default '{}'::jsonb,
  progress   jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

alter table public.saved_plans enable row level security;

drop policy if exists "Read own plans" on public.saved_plans;
create policy "Read own plans" on public.saved_plans
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Add own plans" on public.saved_plans;
create policy "Add own plans" on public.saved_plans
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own plans" on public.saved_plans;
create policy "Update own plans" on public.saved_plans
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own plans" on public.saved_plans;
create policy "Delete own plans" on public.saved_plans
  for delete to authenticated using ((select auth.uid()) = user_id);

-- "Delete my account" in the app: removes the signed-in user and (by the cascade above)
-- everything saved for them. It can only ever delete the person calling it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
