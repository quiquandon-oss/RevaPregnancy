// Resolves "who is this device" against the current Supabase Auth session (research.md #4, #8).
// Never throws — offline or unreachable resolves to a null ownerId, and callers that only need
// local data keep working (constitution Principle V).
import { ensureSession, getSupabaseClient } from "./api-client.js";

export async function getCurrentIdentity() {
  const { data, error } = await ensureSession();
  if (error || !data?.session) return { ownerId: null, email: null };

  try {
    const client = await getSupabaseClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    return { ownerId: user?.id ?? null, email: user?.email ?? null };
  } catch {
    return { ownerId: data.session.user?.id ?? null, email: data.session.user?.email ?? null };
  }
}
