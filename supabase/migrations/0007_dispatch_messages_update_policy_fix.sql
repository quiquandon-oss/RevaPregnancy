-- The original policy used "using (true)", relying only on the trigger to stop misuse. The
-- trigger blocks a sender from marking their own message read, but doesn't stop an unrelated
-- authenticated user (not this dispatch's owner or assigned member) from updating a message
-- they have no business touching, if they guessed/enumerated its id. Scope it the same way the
-- SELECT policy already is.

drop policy if exists dispatch_messages_update on public.dispatch_messages;

create policy dispatch_messages_update
  on public.dispatch_messages for update
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
  )
  with check (true);
