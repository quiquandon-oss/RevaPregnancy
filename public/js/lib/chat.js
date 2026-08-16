// Per-dispatch chat, shared between the owner's dispatch.html and the partner's
// partner.html — same UI, same data, the only difference is `myRole` deciding which side a
// bubble renders on. Uses Supabase Realtime (not the 20s polling used elsewhere in the app)
// since a chat feels wrong on a delay; falls back to nothing happening live if Realtime can't
// connect (messages still send/receive correctly on the next manual refresh() call, e.g. the
// existing 20s poll a caller already has for the dispatch itself).

import { listDispatchMessages, sendDispatchMessage, markMessageRead, subscribeToDispatchMessages } from "../api-client.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Returns an unsubscribe function — call it if the mounting page might mount another chat
// later (e.g. navigating between dispatches) to avoid stacking realtime subscriptions.
export async function mountChat({ container, dispatchId, myRole }) {
  container.innerHTML = `
    <div class="chat-thread" id="chat-thread"></div>
    <div class="row" style="gap: 8px; align-items: flex-end">
      <input type="text" id="chat-input" placeholder="Send a message..." style="flex: 1" />
      <button class="btn btn-primary" id="chat-send" style="width: auto; padding: 0 20px">Send</button>
    </div>
  `;
  const threadEl = container.querySelector("#chat-thread");
  const inputEl = container.querySelector("#chat-input");
  const sendBtn = container.querySelector("#chat-send");

  let messages = [];
  let refreshing = false;

  function render() {
    threadEl.innerHTML = "";
    for (const m of messages) {
      const mine = m.sender_role === myRole;
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${mine ? "chat-bubble--mine" : "chat-bubble--theirs"}`;
      const readMark = mine ? (m.read_at ? " · Read" : " · Sent") : "";
      bubble.innerHTML = `<p>${escapeHtml(m.body)}</p><span class="micro">${formatTime(m.created_at)}${readMark}</span>`;
      threadEl.appendChild(bubble);
    }
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  async function markIncomingAsRead() {
    const unread = messages.filter((m) => m.sender_role !== myRole && !m.read_at);
    for (const m of unread) {
      try {
        await markMessageRead(m.id);
        m.read_at = new Date().toISOString(); // optimistic — a full refresh() will confirm
      } catch {
        // Best-effort: an unread mark failing here just means it stays "unread" until the
        // next successful attempt, which is harmless (only cosmetic, on the sender's side).
      }
    }
  }

  async function refresh() {
    if (refreshing) return; // avoid overlapping refreshes from realtime + manual calls
    refreshing = true;
    try {
      const { data, error } = await listDispatchMessages(dispatchId);
      if (!error && data) {
        messages = data;
        render();
        await markIncomingAsRead();
      }
    } finally {
      refreshing = false;
    }
  }

  async function send() {
    const body = inputEl.value.trim();
    if (!body) return;
    inputEl.value = "";
    const { error } = await sendDispatchMessage(dispatchId, body);
    if (!error) await refresh();
  }

  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") send();
  });

  await refresh();
  return subscribeToDispatchMessages(dispatchId, refresh);
}
