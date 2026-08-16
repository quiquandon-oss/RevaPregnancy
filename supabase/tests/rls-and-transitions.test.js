// Exercises the RLS policies and status-transition trigger from
// supabase/migrations/0001_init.sql against a real Postgres instance.
//
// Run against a local Supabase stack (`npm run supabase:start`, once per checkout —
// requires Docker) with: `npm run test:backend`. If no database is reachable at
// TEST_DATABASE_URL (default: Supabase's local convention, port 54322), every test in this
// file is skipped rather than failed, so `node --test` stays green in environments without
// Docker/Supabase available (e.g. this repo's CI sandbox) — this file's logic was manually
// verified end-to-end against a real Postgres instance with a stub `auth` schema during
// development; see the implementation notes for the exact scenarios covered below.

import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";

// A dedicated (non-pooled) connection per simulated identity — pg's connection pool does not
// reset session state (SET ROLE, session GUCs) when a client is released back to the pool, so
// reusing pooled connections across different simulated users would leak one user's
// role/claims into another's queries. A fresh Client per identity mirrors how each request to
// Supabase's PostgREST carries its own JWT anyway, and sidesteps that leakage entirely. Callers
// must call `.end()` on the returned client when done with it.
async function connectAsRole(_pool, userId) {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  return client;
}

async function seedAuthUser(pool, userId) {
  await pool.query("insert into auth.users (id) values ($1) on conflict do nothing", [userId]);
}

let pool;
let dbReachable = true;

test.before(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
  } catch {
    dbReachable = false;
  }
});

test.after(async () => {
  if (pool) await pool.end();
});

test("support network invite: create, accept, and RLS-scoped visibility", async (t) => {
  if (!dbReachable) { t.skip("no local Postgres/Supabase reachable"); return; }
  await seedAuthUser(pool, USER_A);
  await seedAuthUser(pool, USER_B);

  const asA = await connectAsRole(pool, USER_A);
  const invite = await asA.query(
    "insert into public.support_network_members default values returning id, invite_code, status"
  );
  assert.equal(invite.rows[0].status, "pending");
  const inviteCode = invite.rows[0].invite_code;
  await asA.end();

  const asB = await connectAsRole(pool, USER_B);
  const accepted = await asB.query("select * from public.accept_invite($1, $2)", [inviteCode, "Sam"]);
  assert.equal(accepted.rows[0].status, "accepted");
  assert.equal(accepted.rows[0].member_auth_id, USER_B);
  await asB.end();

  // Owner sees it in her list.
  const asA2 = await connectAsRole(pool, USER_A);
  const ownerView = await asA2.query("select * from public.support_network_members where owner_id = $1", [USER_A]);
  assert.equal(ownerView.rows.length, 1);
  assert.equal(ownerView.rows[0].status, "accepted");
  await asA2.end();

  // A stranger sees nothing.
  await seedAuthUser(pool, USER_C);
  const asC = await connectAsRole(pool, USER_C);
  const strangerView = await asC.query("select count(*)::int as n from public.support_network_members");
  assert.equal(strangerView.rows[0].n, 0);
  await asC.end();
});

test(
  "accept_invite is atomic and cannot be reused",
  async (t) => {
    if (!dbReachable) {
      t.skip("no local Postgres/Supabase reachable");
      return;
    }
    await seedAuthUser(pool, USER_A);
    await seedAuthUser(pool, USER_B);
    await seedAuthUser(pool, USER_C);

    const asA = await connectAsRole(pool, USER_A);
    const invite = await asA.query(
      "insert into public.support_network_members default values returning invite_code"
    );
    const inviteCode = invite.rows[0].invite_code;
    await asA.end();

    const asB = await connectAsRole(pool, USER_B);
    await asB.query("select * from public.accept_invite($1, $2)", [inviteCode, "Sam"]);
    await asB.end();

    const asC = await connectAsRole(pool, USER_C);
    await assert.rejects(() => asC.query("select * from public.accept_invite($1, $2)", [inviteCode, "Eve"]));
    await asC.end();
  }
);

test("dispatch lifecycle: self, support-member, and status transitions", async (t) => {
  if (!dbReachable) { t.skip("no local Postgres/Supabase reachable"); return; }
  await seedAuthUser(pool, USER_A);
  await seedAuthUser(pool, USER_B);

  const asA = await connectAsRole(pool, USER_A);
  const invite = await asA.query(
    "insert into public.support_network_members default values returning id, invite_code"
  );
  const memberRowId = invite.rows[0].id;
  const inviteCode = invite.rows[0].invite_code;
  await asA.end();

  const asB = await connectAsRole(pool, USER_B);
  await asB.query("select * from public.accept_invite($1, $2)", [inviteCode, "Sam"]);
  await asB.end();

  const asA2 = await connectAsRole(pool, USER_A);
  const selfDispatch = await asA2.query(
    "insert into public.dispatches (category, intensity, fulfiller) values ('salty', 3, 'self') returning status, assigned_member_id"
  );
  assert.equal(selfDispatch.rows[0].status, "delivered");
  assert.equal(selfDispatch.rows[0].assigned_member_id, null);

  const partnerDispatch = await asA2.query(
    `insert into public.dispatches (category, intensity, fulfiller, assigned_member_id)
     values ('sweet', 4, 'support_member', $1) returning id, status`,
    [memberRowId]
  );
  const dispatchId = partnerDispatch.rows[0].id;
  assert.equal(partnerDispatch.rows[0].status, "requested");
  await asA2.end();

  const asB2 = await connectAsRole(pool, USER_B);
  const visibleToB = await asB2.query("select id from public.dispatches where assigned_member_id = $1", [
    memberRowId,
  ]);
  assert.equal(visibleToB.rows.length, 1);

  await asB2.query("update public.dispatches set status = 'accepted' where id = $1", [dispatchId]);
  await asB2.query("update public.dispatches set status = 'on_the_way' where id = $1", [dispatchId]);
  const delivered = await asB2.query(
    "update public.dispatches set status = 'delivered' where id = $1 returning status",
    [dispatchId]
  );
  assert.equal(delivered.rows[0].status, "delivered");

  // Terminal state: further updates must fail.
  await assert.rejects(() => asB2.query("update public.dispatches set status = 'requested' where id = $1", [dispatchId]));
  await asB2.end();

  // Owner can only cancel, never jump straight to delivered.
  const asA3 = await connectAsRole(pool, USER_A);
  const another = await asA3.query(
    `insert into public.dispatches (category, intensity, fulfiller, assigned_member_id)
     values ('sour', 2, 'support_member', $1) returning id`,
    [memberRowId]
  );
  await assert.rejects(() =>
    asA3.query("update public.dispatches set status = 'delivered' where id = $1", [another.rows[0].id])
  );
  const cancelled = await asA3.query(
    "update public.dispatches set status = 'cancelled' where id = $1 returning status",
    [another.rows[0].id]
  );
  assert.equal(cancelled.rows[0].status, "cancelled");
  await asA3.end();
});

test("a revoked member immediately loses dispatch access", async (t) => {
  if (!dbReachable) { t.skip("no local Postgres/Supabase reachable"); return; }
  await seedAuthUser(pool, USER_A);
  await seedAuthUser(pool, USER_B);

  const asA = await connectAsRole(pool, USER_A);
  const invite = await asA.query(
    "insert into public.support_network_members default values returning id, invite_code"
  );
  const memberRowId = invite.rows[0].id;
  const inviteCode = invite.rows[0].invite_code;
  await asA.end();

  const asB = await connectAsRole(pool, USER_B);
  await asB.query("select * from public.accept_invite($1, $2)", [inviteCode, "Sam"]);
  await asB.end();

  const asA2 = await connectAsRole(pool, USER_A);
  await asA2.query(
    `insert into public.dispatches (category, intensity, fulfiller, assigned_member_id)
     values ('fresh_fruit', 3, 'support_member', $1)`,
    [memberRowId]
  );
  await asA2.query("update public.support_network_members set status = 'revoked' where id = $1", [memberRowId]);
  await asA2.end();

  const asB2 = await connectAsRole(pool, USER_B);
  const visibleAfterRevoke = await asB2.query("select count(*)::int as n from public.dispatches where assigned_member_id = $1", [
    memberRowId,
  ]);
  assert.equal(visibleAfterRevoke.rows[0].n, 0);
  await asB2.end();
});

test("comfort_entries are owner-only, never visible to a support-network member", async (t) => {
  if (!dbReachable) { t.skip("no local Postgres/Supabase reachable"); return; }
  await seedAuthUser(pool, USER_A);
  await seedAuthUser(pool, USER_B);

  const asA = await connectAsRole(pool, USER_A);
  await asA.query("insert into public.comfort_entries (date, energy_level) values (current_date, 'moderate')");
  const upserted = await asA.query(
    `insert into public.comfort_entries (date, energy_level) values (current_date, 'low')
     on conflict (owner_id, date) do update set energy_level = excluded.energy_level
     returning energy_level`
  );
  assert.equal(upserted.rows[0].energy_level, "low");
  await asA.end();

  const asB = await connectAsRole(pool, USER_B);
  const bView = await asB.query("select count(*)::int as n from public.comfort_entries");
  assert.equal(bView.rows[0].n, 0);
  await asB.end();
});
