// Web Push subscription management — used by both the owner (Profile page) and a
// support-network member (partner.html) to opt in to notifications. Browser support for the
// Push API varies (notably: no support in iOS Safari before 16.4, and only for installed/
// home-screen PWAs even then) — isPushSupported() lets callers hide the option gracefully
// rather than showing a button that will just fail.

import { VAPID_PUBLIC_KEY, savePushSubscription, deletePushSubscription } from "../api-client.js";

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

// Requests notification permission (if not already decided) and subscribes this device,
// saving it against the given ownerId (the owner themselves, or the owner a support-network
// member belongs to). Returns { ok: true } or { ok: false, reason } rather than throwing, since
// callers are showing this inline in settings UI, not treating it as a hard failure.
export async function enablePush(ownerId) {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = subscription.toJSON();
    const { error } = await savePushSubscription({
      ownerId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      authKey: json.keys.auth,
    });
    if (error) return { ok: false, reason: "save_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "subscribe_failed" };
  }
}

export async function disablePush() {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  await deletePushSubscription(endpoint).catch(() => {});
}
