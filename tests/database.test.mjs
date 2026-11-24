import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrations = new URL("../supabase/migrations/", import.meta.url);
const editor = new URL("../supabase/sql-editor/", import.meta.url);

// This in-memory Postgres fixture supplies only the objects normally supplied by Supabase.
const platform = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select string_to_array(name, '/'); $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  -- An existing project may have a broad permissive policy for unrelated buckets.
  grant select, insert, update, delete on storage.objects to authenticated;
  create policy fixture_broad_access on storage.objects for all to authenticated using (true) with check (true);
`;

test("OYLA migrations enforce ownership, trusted writes, retry safety, and dashboard aggregation", async () => {
  const db = new PGlite();
  const alpha = randomUUID();
  const bravo = randomUUID();

  async function runAs(role, user, action) {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
      return await action();
    } finally {
      await db.exec("reset role");
    }
  }

  async function row(sql, params) {
    return (await db.query(sql, params)).rows[0];
  }

  const begin = (owner, id, conversation, mode, prompt) => row(
    "select public.oyla_begin_chat($1,$2,$3,$4,$5) as turn", [owner, id, conversation, mode, prompt],
  ).then(({ turn }) => turn);
  const finish = (owner, id, lease, reply) => row(
    "select public.oyla_finish_chat($1,$2,$3,$4,'unit-test',8,3,30) as ok", [owner, id, lease, reply],
  ).then(({ ok }) => ok);
  const dashboard = () => row("select public.oyla_dashboard() as summary").then(({ summary }) => summary);

  try {
    await db.exec(platform);
    for (const filename of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(await readFile(new URL(filename, migrations), "utf8"));
    }
    await db.query("insert into auth.users values ($1, $2), ($3, $4)", [alpha, { full_name: "Alpha" }, bravo, { full_name: "Bravo" }]);
    const buckets = await db.query("select id,public from storage.buckets order by id");
    assert.deepEqual(buckets.rows, [{ id: "avatars", public: false }, { id: "study-materials", public: false }]);
    const unprotected = await row("select count(*)::int as count from pg_tables where schemaname = 'public' and not rowsecurity");
    assert.equal(unprotected.count, 0);

    await runAs("authenticated", alpha, async () => {
      assert.deepEqual((await db.query("select full_name from public.profiles")).rows, [{ full_name: "Alpha" }]);
      assert.equal((await dashboard()).streak, 0);
      assert.deepEqual((await dashboard()).conversations, []);
      await db.query("update public.user_settings set preferred_learning_mode = 'review'");
      await assert.rejects(db.query("update public.user_settings set user_id = $1", [bravo]), /permission denied/);
      await assert.rejects(db.query("select * from oyla_private.assessment_answers"), /permission denied/);
      await assert.rejects(db.query("update public.assessment_attempts set score = 100"), /permission denied/);
      await assert.rejects(begin(alpha, randomUUID(), null, "guided", "A prompt"), /permission denied/);
    });

    const first = randomUUID();
    const second = randomUUID();
    let thread;
    await runAs("service_role", null, async () => {
      thread = await begin(alpha, first, null, "guided", "First prompt");
      await assert.rejects(begin(bravo, randomUUID(), thread.conversationId, "guided", "Wrong owner"), /conversation_not_found/);
      await assert.rejects(begin(alpha, second, thread.conversationId, "guided", "Too early"), /chat_in_progress/);
      await db.query("select public.oyla_fail_chat($1,$2,$3)", [alpha, first, thread.leaseId]);
      const retry = await begin(alpha, first, thread.conversationId, "guided", "First prompt");
      assert.equal(await finish(alpha, first, thread.leaseId, "Stale reply"), false);
      assert.equal(await finish(alpha, first, retry.leaseId, "First reply"), true);
      assert.equal((await begin(alpha, first, null, "guided", "First prompt")).cached, "First reply");
      await assert.rejects(begin(alpha, first, null, "guided", "Changed prompt"), /request_conflict/);
      await assert.rejects(begin(alpha, second, thread.conversationId, "direct", "Wrong mode"), /mode_conflict/);
      await db.query("select public.oyla_set_research_consent($1, true)", [alpha]);
      const next = await begin(alpha, second, thread.conversationId, "guided", "Follow-up prompt");
      assert.deepEqual(next.history, [
        { role: "user", content: "First prompt" }, { role: "assistant", content: "First reply" },
      ]);
      assert.equal(await finish(alpha, second, next.leaseId, "Follow-up reply"), true);
      assert.equal((await row("select count(*)::int as total from oyla_private.research_export")).total, 1);
      await db.query("select public.oyla_set_research_consent($1, false)", [alpha]);
      assert.equal((await row("select count(*)::int as total from oyla_private.research_export")).total, 0);
    });

    await db.query("insert into storage.objects (bucket_id,name) values ('avatars', $1), ('avatars', $2)", [`${alpha}/avatar.png`, `${bravo}/avatar.png`]);
    await runAs("authenticated", alpha, async () => {
      assert.equal((await row("select count(*)::int as count from public.messages")).count, 4);
      const assistant = await row("select input_tokens, output_tokens, latency_ms from public.messages where role = 'assistant'");
      assert.deepEqual(assistant, { input_tokens: 8, output_tokens: 3, latency_ms: 30 });
      assert.equal((await row("select preferred_learning_mode from public.user_settings")).preferred_learning_mode, "review");
      const summary = await dashboard();
      assert.equal(summary.streak, 1);
      assert.equal(summary.usage.guided, 2);
      assert.equal(summary.conversations[0].id, thread.conversationId);
      assert.deepEqual((await db.query("select name from storage.objects")).rows, [{ name: `${alpha}/avatar.png` }]);
      await assert.rejects(
        db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${alpha}/new.png`]),
        /row-level security/,
      );
      await db.query("insert into storage.objects (bucket_id, name) values ('unrelated', 'legacy-file')");
      assert.equal((await row("select count(*)::int as count from storage.objects where bucket_id = 'unrelated'")).count, 1);
    });

    await runAs("authenticated", bravo, async () => {
      assert.deepEqual((await db.query("select full_name from public.profiles")).rows, [{ full_name: "Bravo" }]);
      assert.deepEqual((await db.query("select id from public.messages")).rows, []);
      assert.deepEqual((await db.query("select id from public.conversations")).rows, []);
      assert.deepEqual((await dashboard()).usage, {});
      assert.equal((await db.query("update public.profiles set full_name = 'blocked' where id = $1 returning id", [alpha])).rows.length, 0);
    });
  } finally {
    await db.close();
  }
});

test("SQL Editor order is executable, repeatable for catalog seeds, and refuses collisions", async () => {
  const db = new PGlite();
  try {
    await db.exec(platform);
    const run = async (file) => db.exec(await readFile(new URL(file, editor), "utf8"));
    await run("00_preflight.sql");
    await run("01_schema.sql");
    assert.equal((await db.query("select has_table_privilege('authenticated', 'public.profiles', 'SELECT') as readable")).rows[0].readable, false);
    await run("02_security.sql");
    await run("03_seed_catalog.sql");
    await run("03_seed_catalog.sql");
    assert.equal((await db.query("select count(*)::int as total from public.courses")).rows[0].total, 3);
    const [result] = await run("04_verify.sql");
    assert.deepEqual(result.rows.filter(({ status }) => status !== "PASS"), []);
    await assert.rejects(run("01_schema.sql"), /Existing OYLA schema/);
    await db.exec("rollback");
    assert.equal((await db.query("select count(*)::int as total from public.courses")).rows[0].total, 3);
  } finally {
    await db.close();
  }
});

test("Phase 04 enforces guided stages, four hint levels, retries, consent, and account isolation", async () => {
  const db = new PGlite();
  const student = randomUUID();
  const other = randomUUID();
  const preferences = { subject: "Math", topic: "Linear equations", objective: "Explain each operation", knowledgeLevel: "beginner", language: "kk" };
  let conversation = null;

  async function begin(action, text, id = randomUUID(), originalPreferences = null) {
    const { rows } = await db.query("select public.oyla_begin_guided_turn($1,$2,$3,$4,$5,$6) as result",
      [student, id, conversation, action, text, originalPreferences]);
    return { id, ...rows[0].result };
  }

  async function finish(turn, { challenge = null, practice = null, guard = null, attempted = false } = {}) {
    const { rows } = await db.query("select public.oyla_finish_guided_turn($1,$2,$3,'Recorded safe feedback','test-deepseek',20,8,30,$4,$5,$6,$7) as result",
      [student, turn.id, turn.leaseId, challenge, practice, guard, attempted]);
    assert.ok(rows[0].result);
    return rows[0].result;
  }

  async function eventCount() {
    return (await db.query("select count(*)::int as n from oyla_private.guided_research_export")).rows[0].n;
  }

  try {
    await db.exec(platform);
    for (const filename of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(await readFile(new URL(filename, migrations), "utf8"));
    }
    const check = await db.exec(await readFile(new URL("../supabase/checks/verify_guided_learning.sql", import.meta.url), "utf8"));
    assert.deepEqual(check[0].rows.map(({ status }) => status), ["PASS", "PASS", "PASS", "PASS"]);
    await db.query("insert into auth.users values ($1,'{}'),($2,'{}')", [student, other]);
    await db.query("insert into public.research_consents (user_id,policy_version) values ($1,'2026-11-v1')", [student]);
    await db.exec("set role service_role");
    await assert.rejects(begin("attempt", "Skip the introduction"), /guided_setup_required/);
    const start = await begin("start", "How can I solve the equation?", randomUUID(), preferences);
    conversation = start.conversationId;
    assert.equal(start.guide.language, "kk");
    assert.equal((await finish(start)).stage, "assess");
    assert.equal(await eventCount(), 0);
    await assert.rejects(begin("hint", "Skip assessment"), /guided_stage_conflict/);
    await assert.rejects(db.query("select public.oyla_end_guided_session($1,$2)", [other, conversation]), /conversation_not_found/);
    assert.equal((await finish(await begin("message", "I know inverse operations."))).stage, "attempt");
    assert.equal(await eventCount(), 0);
    await db.query("select public.oyla_set_research_consent($1, true)", [student]);

    for (let index = 1; index <= 4; index++) {
      const hint = await begin("hint", "Request a progressive hint.");
      assert.equal(hint.hintLevel, index);
      assert.equal((await finish(hint)).hints_used, index);
      const replay = await begin("hint", "Request a progressive hint.", hint.id);
      assert.equal(replay.cached, "Recorded safe feedback");
      assert.equal(replay.guide.hint_requests, index);
    }
    await assert.rejects(begin("hint", "Request a fifth hint."), /guided_hint_limit/);
    await assert.rejects(begin("check", "Skip the first attempt."), /guided_stage_conflict/);
    const attempt = await finish(await begin("attempt", "I undo subtraction before division."), { attempted: true });
    assert.equal(attempt.stage, "correct");
    assert.equal((await finish(await begin("check", "Check my understanding."))).stage, "verify");
    const ownWords = await finish(await begin("attempt", "Both sides must get the same operation."), {
      challenge: "Solve 2y + 6 = 14 using inverse operations.", attempted: true,
    });
    assert.equal(ownWords.stage, "challenge");
    assert.equal(ownWords.attempts, 1);
    await assert.rejects(begin("hint", "Help with the independent challenge."), /guided_stage_conflict/);
    assert.equal(await eventCount(), 14);

    const final = await finish(await begin("attempt", "Subtract six from both sides and divide by two."), {
      attempted: true, practice: "Checking equality by substitution",
    });
    assert.equal(final.challenge_reviewed, true);
    assert.equal(final.attempts, 2);
    assert.equal(final.questions, 1);
    assert.equal(final.hint_requests, 4);
    assert.equal(final.completed_stages.length, 8);
    const closed = (await db.query("select public.oyla_end_guided_session($1,$2) as result", [student, conversation])).rows[0].result;
    assert.equal(closed.status, "completed");
    const exportRows = (await db.query("select * from oyla_private.guided_research_export")).rows;
    assert.equal(exportRows.filter(({ independent_task_completed }) => independent_task_completed).length, 2);
    assert.ok(exportRows.every((event) => !('content' in event) && !('user_id' in event) && event.verified_correctness === null));
    assert.equal(exportRows.find(({ event_type }) => event_type === "session_ended").duration_seconds, null);
    await db.query("select public.oyla_set_research_consent($1, false)", [student]);
    assert.equal(await eventCount(), 0);

    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.equal((await db.query("select * from public.oyla_guided_sessions")).rows.length, 0);
    assert.equal((await db.query("select * from public.oyla_guided_turns")).rows.length, 0);
    await assert.rejects(db.query("select * from oyla_private.guided_research_export"), /permission denied/);
    await assert.rejects(db.query("select public.oyla_end_guided_session($1,$2)", [student, conversation]), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [student]);
    assert.equal((await db.query("select status from public.oyla_guided_sessions")).rows[0].status, "completed");
    await assert.rejects(db.query("update public.oyla_guided_sessions set status = 'active'"), /permission denied/);
  } finally {
    await db.close();
  }
});
