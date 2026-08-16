-- ============================================================================
-- 1. Per-dispatch chat, with read receipts
-- ============================================================================
create table if not exists public.dispatch_messages (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  sender_auth_id uuid not null,
  sender_role text not null check (sender_role in ('owner', 'member')),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists dispatch_messages_dispatch_idx on public.dispatch_messages (dispatch_id);

alter table public.dispatch_messages enable row level security;

-- Forces sender_auth_id/sender_role from who's actually calling (never trust client input),
-- and confirms they're actually a party to this dispatch (its owner, or its assigned member).
create or replace function public.handle_dispatch_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dispatches;
begin
  select * into d from public.dispatches where id = new.dispatch_id;
  if d.id is null then
    raise exception 'dispatch not found';
  end if;

  new.sender_auth_id := auth.uid();
  new.created_at := coalesce(new.created_at, now());
  new.read_at := null;

  if d.owner_id = auth.uid() then
    new.sender_role := 'owner';
  elsif exists (
    select 1 from public.support_network_members m
    where m.id = d.assigned_member_id
      and m.member_auth_id = auth.uid()
      and m.status = 'accepted'
  ) then
    new.sender_role := 'member';
  else
    raise exception 'not authorized to message on this dispatch';
  end if;

  return new;
end;
$$;

create trigger dispatch_messages_before_insert
  before insert on public.dispatch_messages
  for each row execute function public.handle_dispatch_message_insert();

-- Only read_at is ever mutable, and only by whoever DIDN'T send it (marking a message as
-- read), first-read-wins. Enforced here rather than trusting the client's UPDATE payload.
create or replace function public.handle_dispatch_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_auth_id <> old.sender_auth_id
     or new.sender_role <> old.sender_role
     or new.dispatch_id <> old.dispatch_id
     or new.body <> old.body
     or new.created_at <> old.created_at then
    raise exception 'only read_at can be updated on a message';
  end if;
  if old.sender_auth_id = auth.uid() then
    raise exception 'cannot mark your own message as read';
  end if;
  new.read_at := coalesce(old.read_at, now());
  return new;
end;
$$;

create trigger dispatch_messages_before_update
  before update on public.dispatch_messages
  for each row execute function public.handle_dispatch_message_update();

create policy dispatch_messages_select
  on public.dispatch_messages for select
  using (
    exists (
      select 1 from public.dispatches d
      where d.id = dispatch_messages.dispatch_id
        and (
          d.owner_id = auth.uid()
          or exists (
            select 1 from public.support_network_members m
            where m.id = d.assigned_member_id
              and m.member_auth_id = auth.uid()
              and m.status = 'accepted'
          )
        )
    )
  );

create policy dispatch_messages_insert on public.dispatch_messages for insert with check (true);
create policy dispatch_messages_update on public.dispatch_messages for update using (true) with check (true);

alter publication supabase_realtime add table public.dispatch_messages;

-- "Seen" receipt on the request itself (distinct from message-level read receipts) — lets the
-- owner see that a request was opened even before any reply is sent.
alter table public.dispatches add column if not exists member_viewed_at timestamptz;

create or replace function public.mark_dispatch_viewed(p_dispatch_id uuid)
returns public.dispatches
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.dispatches;
begin
  update public.dispatches
  set member_viewed_at = coalesce(member_viewed_at, now())
  where id = p_dispatch_id
    and exists (
      select 1 from public.support_network_members m
      where m.id = dispatches.assigned_member_id
        and m.member_auth_id = auth.uid()
        and m.status = 'accepted'
    )
  returning * into result;

  if result.id is null then
    raise exception 'not authorized or dispatch not found';
  end if;
  return result;
end;
$$;

-- ============================================================================
-- 2. Push subscriptions (Web Push) — one row per browser/device that opted in
-- ============================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null,   -- whoever this device's session belongs to (owner OR a member)
  owner_id uuid not null,  -- which owner's activity this device wants notified about
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create or replace function public.handle_push_subscription_insert()
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
    raise exception 'not authorized to subscribe for this owner_id';
  end if;
  return new;
end;
$$;

create trigger push_subscriptions_before_insert
  before insert on public.push_subscriptions
  for each row execute function public.handle_push_subscription_insert();

create policy push_subscriptions_insert on public.push_subscriptions for insert with check (true);
create policy push_subscriptions_upsert_update on public.push_subscriptions for update using (auth_id = auth.uid()) with check (true);
create policy push_subscriptions_select_own on public.push_subscriptions for select using (auth_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions for delete using (auth_id = auth.uid());

-- ============================================================================
-- 3. Let a full_support_access member add Timeline memories on the owner's behalf
-- ============================================================================
alter table public.memories add column if not exists added_by_member_id uuid references public.support_network_members (id) on delete set null;

-- The existing insert trigger forces owner_id := auth.uid(), which is correct for the owner's
-- own direct inserts but wrong for this RPC (auth.uid() there is the *member*, not the owner).
-- app.trusted_memory_insert is a transaction-local flag only this RPC sets, so a plain client
-- insert can never bypass the owner_id-forcing behavior this way.
create or replace function public.handle_memory_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('app.trusted_memory_insert', true) is distinct from 'true' then
    new.owner_id := auth.uid();
  end if;
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$;

create or replace function public.create_memory_as_support_member(
  p_owner_id uuid,
  p_title text,
  p_date date,
  p_category text,
  p_note text,
  p_photo_path text
)
returns public.memories
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.memories;
  member_id uuid;
begin
  select id into member_id
  from public.support_network_members
  where owner_id = p_owner_id
    and member_auth_id = auth.uid()
    and status = 'accepted'
    and permission_level = 'full_support_access'
  limit 1;

  if member_id is null then
    raise exception 'not authorized';
  end if;

  perform set_config('app.trusted_memory_insert', 'true', true);

  insert into public.memories (owner_id, title, date, category, note, photo_path, added_by_member_id)
  values (p_owner_id, p_title, p_date, p_category, p_note, p_photo_path, member_id)
  returning * into result;

  return result;
end;
$$;

create policy memories_storage_support_member_insert
  on storage.objects for insert
  with check (
    bucket_id = 'memories'
    and exists (
      select 1 from public.support_network_members m
      where m.owner_id = ((storage.foldername(name))[1])::uuid
        and m.member_auth_id = auth.uid()
        and m.status = 'accepted'
        and m.permission_level = 'full_support_access'
    )
  );

-- ============================================================================
-- 4. Vault secrets + pg_net trigger -> Edge Function, to actually send push notifications
-- ============================================================================
-- NOTE: the vault.create_secret() calls that seeded 'vapid_private_key' and
-- 'push_webhook_secret' were run once, live, and are NOT repeated here — re-running
-- vault.create_secret with the same name errors on a fresh apply. See README/HANDOFF for the
-- values (private key + webhook secret are not committed to this repo, by design).
create extension if not exists pg_net;

create or replace function public.notify_push(p_type text, p_record jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  perform net.http_post(
    url := 'https://zwxfmdhgnlhtkixfkdob.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('type', p_type, 'record', p_record)
  );
end;
$$;

create or replace function public.trigger_notify_dispatch_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_push('message', to_jsonb(new));
  return new;
end;
$$;

create trigger dispatch_messages_after_insert
  after insert on public.dispatch_messages
  for each row execute function public.trigger_notify_dispatch_message();

create or replace function public.trigger_notify_dispatch_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_member_id is not null then
    perform public.notify_push('dispatch', to_jsonb(new));
  end if;
  return new;
end;
$$;

create trigger dispatches_after_insert
  after insert on public.dispatches
  for each row execute function public.trigger_notify_dispatch_created();
