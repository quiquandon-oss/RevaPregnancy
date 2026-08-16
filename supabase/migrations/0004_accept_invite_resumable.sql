-- accept_invite() previously only matched status = 'pending', so re-opening an
-- already-accepted (not revoked) invite link always failed with "invite not found or
-- already used" — contradicting the spec's own clarification (spec.md, "What happens if the
-- invited person's link/code is used more than once") that reusing a link should resume
-- access, not dead-end, and that only an explicit revoke should cut it off.

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
    and support_network_members.status <> 'revoked'
  returning * into result;

  if result.id is null then
    raise exception 'invite not found or already used';
  end if;

  return result;
end;
$$;
