-- vault.decrypted_secrets isn't exposed via PostgREST (only 'public' is), so the edge function
-- can't just .from() it. This RPC wraps the lookup — and is explicitly locked to service_role
-- only, since returning these secrets to an ordinary anon/authenticated caller would leak the
-- VAPID private key and the webhook shared secret to any client.

create or replace function public.get_push_secrets()
returns table (vapid_private_key text, webhook_secret text)
language sql
security definer
set search_path = public
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret');
$$;

revoke execute on function public.get_push_secrets() from public, anon, authenticated;
grant execute on function public.get_push_secrets() to service_role;
