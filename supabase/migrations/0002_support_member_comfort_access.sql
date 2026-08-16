-- Lets an accepted support-network member with full_support_access read the owner's
-- comfort_entries (mood/energy check-ins). dispatch_recipient members still can't —
-- this is additive to the existing owner-only select policy, not a replacement.
--
-- Part of expanding invited-partner scope beyond dispatches-only (was FR-022's original
-- restriction). Permission level is chosen by the owner at invite time (support-network.html
-- / onboarding's invite step) and can be changed later via updatePermissionLevel().

create policy comfort_entries_select_support_member
  on public.comfort_entries for select
  using (
    exists (
      select 1 from public.support_network_members m
      where m.owner_id = comfort_entries.owner_id
        and m.member_auth_id = auth.uid()
        and m.status = 'accepted'
        and m.permission_level = 'full_support_access'
    )
  );
