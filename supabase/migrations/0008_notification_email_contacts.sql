-- Deliberately separate from Supabase Auth's own email (which the "Back up my account" flow
-- depends on, and is blocked on the default rate-limited email sender). This is just "where
-- should Resend send an alert" — no confirmation loop, no auth implications.

create table if not exists public.notification_contacts (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null unique,  -- one notification email per person
  owner_id uuid not null,        -- whose activity this email cares about
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.notification_contacts enable row level security;

create or replace function public.handle_notification_contact_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.auth_id := auth.uid();
  new.created_at := coalesce(new.created_at, now());
  if new.owner_id <> auth.uid() and not exists (
    select 1 from public.support_network_members m
    where m.owner_id = new.owner_id
      and m.member_auth_id = auth.uid()
      and m.status = 'accepted'
  ) then
    raise exception 'not authorized to set a notification email for this owner_id';
  end if;
  return new;
end;
$$;

create trigger notification_contacts_before_insert
  before insert on public.notification_contacts
  for each row execute function public.handle_notification_contact_insert();

create policy notification_contacts_insert on public.notification_contacts for insert with check (true);
create policy notification_contacts_update on public.notification_contacts for update using (auth_id = auth.uid()) with check (true);
create policy notification_contacts_select_own on public.notification_contacts for select using (auth_id = auth.uid());
create policy notification_contacts_delete_own on public.notification_contacts for delete using (auth_id = auth.uid());

-- Extend the existing locked-down secrets RPC to also expose the Resend key to the edge
-- function — still service_role only. Return type changed, so drop-then-create.
-- NOTE: the vault.create_secret('...', 'resend_api_key', ...) call that seeded the actual key
-- was run once, live, and is NOT repeated here (re-running it on a fresh apply would error,
-- since the name already exists) — see HANDOFF.md for why secrets aren't committed to this repo.
drop function if exists public.get_push_secrets();

create function public.get_push_secrets()
returns table (vapid_private_key text, webhook_secret text, resend_api_key text)
language sql
security definer
set search_path = public
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key');
$$;

revoke execute on function public.get_push_secrets() from public, anon, authenticated;
grant execute on function public.get_push_secrets() to service_role;
