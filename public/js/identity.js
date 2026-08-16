// Resolves "who is this device" against the current Supabase Auth session (research.md #4, #8).
import { supabase, ensureSession } from "./api-client.js";

export async function getCurrentIdentity() {
  await ensureSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { ownerId: user?.id ?? null, email: user?.email ?? null };
}
