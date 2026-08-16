-- Timeline memories sync: metadata table + private Storage bucket for photos.
-- Photos are compressed client-side to ~1600px/JPEG before upload (see
-- js/lib/image-compress.js); file_size_limit here is a hard server-side backstop.
--
-- Lets memories.owner (dispatches/comfort_entries-style RLS) and, additionally, an accepted
-- full_support_access support-network member read them (mirrors 0002's comfort_entries policy).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memories', 'memories', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  date date not null,
  category text not null default 'milestone'
    check (category in ('photo', 'ultrasound', 'milestone')),
  note text,
  photo_path text,
  created_at timestamptz not null default now()
);

create index if not exists memories_owner_idx on public.memories (owner_id);

alter table public.memories enable row level security;

create or replace function public.handle_memory_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.owner_id := auth.uid();
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$;

create trigger memories_before_insert
  before insert on public.memories
  for each row execute function public.handle_memory_insert();

create policy memories_select_owner
  on public.memories for select
  using (owner_id = auth.uid());

create policy memories_select_support_member
  on public.memories for select
  using (
    exists (
      select 1 from public.support_network_members m
      where m.owner_id = memories.owner_id
        and m.member_auth_id = auth.uid()
        and m.status = 'accepted'
        and m.permission_level = 'full_support_access'
    )
  );

create policy memories_insert
  on public.memories for insert
  with check (true); -- trigger forces owner_id := auth.uid()

create policy memories_update
  on public.memories for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy memories_delete
  on public.memories for delete
  using (owner_id = auth.uid());

-- Photo files live at "{owner_id}/{memory_id}.jpg" inside the memories bucket, so both
-- policies can key off the first path segment without a join back to the memories table.
create policy memories_storage_owner_all
  on storage.objects for all
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);

create policy memories_storage_support_member_select
  on storage.objects for select
  using (
    bucket_id = 'memories'
    and exists (
      select 1 from public.support_network_members m
      where m.owner_id = ((storage.foldername(name))[1])::uuid
        and m.member_auth_id = auth.uid()
        and m.status = 'accepted'
        and m.permission_level = 'full_support_access'
    )
  );
