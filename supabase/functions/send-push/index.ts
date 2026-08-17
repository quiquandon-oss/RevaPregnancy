// send-push: triggered by Postgres (dispatch_messages/dispatches inserts, via pg_net + a
// shared secret, not a real user JWT — this is an internal webhook, not a public endpoint).
// Looks up who should be notified for the given owner_id, and sends BOTH a Web Push
// notification (push_subscriptions) and an email via Resend (notification_contacts) — two
// independent channels, since push alone depends on the browser/OS keeping a service worker
// alive, which is exactly what's unreliable on the device that prompted adding email at all.
//
// verify_jwt is disabled for this function (see deploy call) since the caller is the database
// itself, not an end user with a Supabase session — auth here is the x-webhook-secret header
// instead, checked against the same value stored in Vault that the DB trigger reads.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_FROM = "Crave & Care <onboarding@resend.dev>";

async function sendEmail(resendApiKey: string, to: string, subject: string, text: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, text }),
    });
    if (!res.ok) console.error("resend send failed", res.status, await res.text());
  } catch (err) {
    console.error("resend send threw", err);
  }
}

Deno.serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify this call actually came from our own DB trigger, not a random request to the
    // public function URL.
    const { data: secrets, error: secretsError } = await admin.rpc("get_push_secrets");
    if (secretsError || !secrets?.[0]) {
      console.error("could not load push secrets", secretsError);
      return new Response("internal error", { status: 500 });
    }
    const {
      vapid_private_key: vapidPrivateKey,
      webhook_secret: expectedSecret,
      resend_api_key: resendApiKey,
    } = secrets[0];
    if (!expectedSecret || req.headers.get("x-webhook-secret") !== expectedSecret) {
      return new Response("unauthorized", { status: 401 });
    }
    if (!vapidPrivateKey) return new Response("no vapid key configured", { status: 500 });

    webpush.setVapidDetails(
      "mailto:support@crave-and-care.invalid",
      "BBQti0gRRvMx9OVorDTUBAsYz3uwGBdVh7zuCzNDqG7V2oQVXhogCSZwBadpuEREeJsChFrZUZteLMhS0RrMpYw",
      vapidPrivateKey
    );

    const { type, record } = await req.json();

    // Precisely who should receive this — not "everyone connected to this owner", since with
    // more than one support-network member that would notify people who have nothing to do
    // with this particular dispatch.
    let recipientAuthId: string | null = null;
    let title = "Crave & Care";
    let body = "You have an update.";

    if (type === "message") {
      const { data: dispatch } = await admin
        .from("dispatches")
        .select("owner_id, item_name, category, assigned_member_id")
        .eq("id", record.dispatch_id)
        .maybeSingle();
      if (!dispatch) return new Response("dispatch not found", { status: 200 });

      if (record.sender_role === "owner") {
        if (!dispatch.assigned_member_id) return new Response("no assignee", { status: 200 });
        const { data: member } = await admin
          .from("support_network_members")
          .select("member_auth_id")
          .eq("id", dispatch.assigned_member_id)
          .maybeSingle();
        recipientAuthId = member?.member_auth_id ?? null;
      } else {
        recipientAuthId = dispatch.owner_id;
      }

      const itemLabel = dispatch.item_name || dispatch.category || "your request";
      title = record.sender_role === "owner" ? "New message" : "New reply";
      body = `About ${itemLabel}: ${String(record.body).slice(0, 120)}`;
    } else if (type === "dispatch") {
      if (!record.assigned_member_id) return new Response("no assignee", { status: 200 });
      const { data: member } = await admin
        .from("support_network_members")
        .select("member_auth_id")
        .eq("id", record.assigned_member_id)
        .maybeSingle();
      recipientAuthId = member?.member_auth_id ?? null;
      const itemLabel = record.item_name || record.category || "something";
      title = "New craving request";
      body = `Could you help with ${itemLabel}?`;
    } else {
      return new Response("unknown type", { status: 200 });
    }

    if (!recipientAuthId) return new Response("no recipient", { status: 200 });

    const [{ data: subs }, { data: contact }] = await Promise.all([
      admin.from("push_subscriptions").select("endpoint, p256dh, auth_key").eq("auth_id", recipientAuthId),
      admin.from("notification_contacts").select("email").eq("auth_id", recipientAuthId).maybeSingle(),
    ]);

    const targets = subs || [];
    const payload = JSON.stringify({ title, body, url: "./" });

    const results = await Promise.allSettled([
      ...targets.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            payload
          );
        } catch (err) {
          // A stale/expired subscription (410 Gone, etc.) shouldn't fail the whole batch —
          // clean it up so future sends don't keep retrying a dead endpoint.
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }),
      resendApiKey && contact?.email ? sendEmail(resendApiKey, contact.email, title, body) : Promise.resolve(),
    ]);

    return new Response(JSON.stringify({ pushSent: targets.length, emailSent: !!contact?.email, results: results.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response("internal error", { status: 500 });
  }
});
