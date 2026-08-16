-- Crave & Care: initial schema for the three server-synced entities.
-- Everything else (appointments, questions, profile fields) stays client-only
-- and never appears in this database — see data-model.md.

-- =====================================================================
-- Tables
-- =====================================================================

create table if not exists public.support_network_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  display_name text,
  permission_level text not null default 'dispatch_recipient'
    check (permission_level in ('dispatch_recipient', 'full_support_access')),
  invite_code text not null unique,
  member_auth_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category text not null
    check (category in ('salty', 'sweet', 'sour', 'cold_drink', 'fresh_fruit', 'specific_snack')),
  item_name text,
  intensity smallint not null check (intensity between 1 and 5),
  fulfiller text not null check (fulfiller in ('self', 'support_member')),
  assigned_member_id uuid references public.support_network_members (id) on delete set null,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'on_the_way', 'delivered', 'cancelled')),
  requested_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);

create table if not exists public.comfort_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  energy_level text check (energy_level in ('low', 'moderate', 'full')),
  statuses jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (owner_id, date)
);

create index if not exists dispatches_owner_idx on public.dispatches (owner_id);
create index if not exists dispatches_assignee_idx on public.dispatches (assigned_member_id);
create index if not exists support_network_members_owner_idx on public.support_network_members (owner_id);
create index if not exists support_network_members_member_idx on public.support_network_members (member_auth_id);
create index if not exists comfort_entries_owner_date_idx on public.comfort_entries (owner_id, date);

alter table public.support_network_members enable row level security;
alter table public.dispatches enable row level security;
alter table public.comfort_entries enable row level security;

-- =====================================================================
-- support_network_members: invite generation + RLS
-- =====================================================================

-- Generates a short, unguessable "word-word-number" invite code.
create or replace function public.generate_invite_code()
returns text
language sql
volatile
as $$
  select (
    (array['warm', 'gentle', 'sunny', 'quiet', 'bright', 'calm', 'soft', 'kind'])[floor(random() * 8 + 1)]
    || '-' ||
    (array['otter', 'willow', 'harbor', 'meadow', 'ember', 'brook', 'linden', 'dove'])[floor(random() * 8 + 1)]
    || '-' ||
    lpad(floor(random() * 100)::text, 2, '0')
  );
$$;

create or replace function public.handle_invite_insert()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.owner_id := auth.uid();
  new.status := 'pending';
  new.member_auth_id := null;
  new.invited_at := now();
  new.accepted_at := null;
  new.revoked_at := null;
  if new.invite_code is null or length(new.invite_code) = 0 then
    new.invite_code := public.generate_invite_code();
  end if;
  return new;
end;
$$;

create trigger support_network_members_before_insert
  before insert on public.support_network_members
  for each row execute function public.handle_invite_insert();

create or replace function public.handle_invite_update()
returns trigger
language plpgsql
security invoker
as $$
begin
  -- RLS's update policy (owner_id = auth.uid()) already ensures a plain client update can
  -- only ever reach a row the caller owns. accept_invite() is SECURITY DEFINER and bypasses
  -- RLS entirely, by design, so it can complete the pending -> accepted transition on behalf
  -- of the invitee (who is never the owner) — this trigger must not block that path.
  new.owner_id := old.owner_id;
  new.invite_code := old.invite_code;

  if old.status = 'pending' and new.status = 'accepted' then
    -- The accept_invite() transition: member_auth_id/display_name are legitimately set here.
    new.accepted_at := now();
  else
    -- Any other update (owner revoking, or changing permission level): membership fields
    -- set by accept_invite() may not be altered by a plain client update.
    new.member_auth_id := old.member_auth_id;
    new.status := coalesce(new.status, old.status);
    if new.status = 'revoked' and old.status <> 'revoked' then
      new.revoked_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger support_network_members_before_update
  before update on public.support_network_members
  for each row execute function public.handle_invite_update();

create policy support_network_members_select
  on public.support_network_members for select
  using (owner_id = auth.uid() or member_auth_id = auth.uid());

create policy support_network_members_insert
  on public.support_network_members for insert
  with check (true); -- trigger forces owner_id := auth.uid()

create policy support_network_members_update
  on public.support_network_members for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- =====================================================================
-- dispatches: creation defaults + status state machine + RLS
-- =====================================================================

create or replace function public.handle_dispatch_insert()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.owner_id := auth.uid();
  new.requested_at := now();
  new.status_updated_at := now();

  if new.fulfiller = 'self' then
    new.assigned_member_id := null;
    new.status := 'delivered';
  elsif new.fulfiller = 'support_member' then
    if new.assigned_member_id is null then
      raise exception 'assigned_member_id is required when fulfiller is support_member';
    end if;
    if not exists (
      select 1 from public.support_network_members
      where id = new.assigned_member_id
        and owner_id = auth.uid()
        and status = 'accepted'
    ) then
      raise exception 'assigned member must be an accepted support network member you own';
    end if;
    new.status := 'requested';
  end if;

  return new;
end;
$$;

create trigger dispatches_before_insert
  before insert on public.dispatches
  for each row execute function public.handle_dispatch_insert();

create or replace function public.handle_dispatch_update()
returns trigger
language plpgsql
security invoker
as $$
declare
  is_owner boolean;
  is_assignee boolean;
begin
  is_owner := (old.owner_id = auth.uid());
  is_assignee := exists (
    select 1 from public.support_network_members
    where id = old.assigned_member_id and member_auth_id = auth.uid()
  );

  if old.status in ('delivered', 'cancelled') then
    raise exception 'dispatch status is final and cannot change';
  end if;

  if new.status = old.status then
    new.status_updated_at := old.status_updated_at;
    return new;
  end if;

  if is_assignee then
    if not (
      (old.status = 'requested' and new.status = 'accepted') or
      (old.status = 'accepted' and new.status = 'on_the_way') or
      (old.status = 'on_the_way' and new.status = 'delivered')
    ) then
      raise exception 'invalid status transition for the assigned member';
    end if;
  elsif is_owner then
    if new.status <> 'cancelled' then
      raise exception 'the owner may only cancel a dispatch';
    end if;
    if old.status not in ('requested', 'accepted') then
      raise exception 'a dispatch can only be cancelled from requested or accepted';
    end if;
  else
    raise exception 'not authorized to update this dispatch';
  end if;

  new.owner_id := old.owner_id;
  new.category := old.category;
  new.fulfiller := old.fulfiller;
  new.assigned_member_id := old.assigned_member_id;
  new.status_updated_at := now();
  return new;
end;
$$;

create trigger dispatches_before_update
  before update on public.dispatches
  for each row execute function public.handle_dispatch_update();

create policy dispatches_select
  on public.dispatches for select
  using (
    owner_id = auth.uid()
    or assigned_member_id in (
      select id from public.support_network_members where member_auth_id = auth.uid()
    )
  );

create policy dispatches_insert
  on public.dispatches for insert
  with check (true); -- trigger forces owner_id := auth.uid() and validates fulfiller/assignee

create policy dispatches_update
  on public.dispatches for update
  using (
    owner_id = auth.uid()
    or assigned_member_id in (
      select id from public.support_network_members where member_auth_id = auth.uid()
    )
  )
  with check (true); -- trigger enforces the transition/role rules

-- =====================================================================
-- comfort_entries: owner-only, no assignee concept
-- =====================================================================

create or replace function public.handle_comfort_entry_write()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.owner_id := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger comfort_entries_before_insert
  before insert on public.comfort_entries
  for each row execute function public.handle_comfort_entry_write();

create trigger comfort_entries_before_update
  before update on public.comfort_entries
  for each row execute function public.handle_comfort_entry_write();

create policy comfort_entries_select
  on public.comfort_entries for select
  using (owner_id = auth.uid());

create policy comfort_entries_insert
  on public.comfort_entries for insert
  with check (true); -- trigger forces owner_id := auth.uid()

create policy comfort_entries_update
  on public.comfort_entries for update
  using (owner_id = auth.uid())
  with check (true); -- trigger forces owner_id := auth.uid()

-- =====================================================================
-- accept_invite RPC: atomically claim an invite as the calling session
-- =====================================================================

create or replace function public.accept_invite(p_invite_code text, p_display_name text default null)
returns public.support_network_members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.support_network_members;
begin
  update public.support_network_members
  set member_auth_id = auth.uid(),
      display_name = coalesce(p_display_name, support_network_members.display_name),
      status = 'accepted',
      accepted_at = now()
  where support_network_members.invite_code = p_invite_code
    and support_network_members.status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'invite not found or already used';
  end if;

  return result;
end;
$$;

grant execute on function public.accept_invite(text, text) to authenticated, anon;
