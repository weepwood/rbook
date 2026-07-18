import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const productionOrigin = "https://rrrrbook.netlify.app";
const localOrigins = new Set(["http://localhost:5173", "http://localhost:4173"]);

function allowed(origin: string) {
  return origin === productionOrigin || localOrigins.has(origin) || /^https:\/\/[a-z0-9-]+--rrrrbook\.netlify\.app$/.test(origin);
}

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowed(origin) ? origin : productionOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function reply(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function numberParam(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!allowed(origin)) return reply({ error: "origin_not_allowed" }, 403, headers);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: "missing_token" }, 401, headers);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(authorization.slice(7));
  if (authError || !authData.user) return reply({ error: "invalid_token" }, 401, headers);

  const administratorId = authData.user.id;
  const { data: access } = await admin.from("user_access").select("access_level,state").eq("user_id", administratorId).maybeSingle();
  if (access?.access_level !== "administrator" || access.state !== "enabled") return reply({ error: "administrator_required" }, 403, headers);

  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("view") === "users") {
    const page = numberParam(url.searchParams.get("page"), 1, 10000);
    const perPage = numberParam(url.searchParams.get("per_page"), 30, 100);
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return reply({ error: error.message }, 500, headers);
    const users = data.users ?? [];
    const ids = users.map((user) => user.id);
    const [{ data: profiles }, { data: accessRows }] = await Promise.all([
      ids.length ? admin.from("profiles").select("id,username,display_name,avatar_url,bio,location,follower_count,following_count,note_count,created_at,last_seen_at").in("id", ids) : Promise.resolve({ data: [] }),
      ids.length ? admin.from("user_access").select("user_id,access_level,state,updated_at").in("user_id", ids) : Promise.resolve({ data: [] }),
    ]);
    const profileMap = new Map((profiles ?? []).map((row: any) => [row.id, row]));
    const accessMap = new Map((accessRows ?? []).map((row: any) => [row.user_id, row]));
    return reply({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        email_confirmed_at: user.email_confirmed_at,
        banned_until: user.banned_until,
        profile: profileMap.get(user.id) ?? null,
        access: accessMap.get(user.id) ?? { access_level: "member", state: "enabled" },
      })),
      page,
      per_page: perPage,
      total: (data as any).total ?? users.length,
    }, 200, headers);
  }

  if (req.method === "GET") {
    const start14 = new Date(Date.now() - 13 * 86400000);
    start14.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [profilesResult, notesResult, commentsResult, pendingResult, logsResult, recentResult, reportsResult] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("notes").select("id", { count: "exact", head: true }).eq("status", "published").eq("is_hidden", false),
      admin.from("comments").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("is_hidden", false),
      admin.from("content_reports").select("id", { count: "exact", head: true }).eq("review_state", "pending"),
      admin.from("access_logs").select("created_at,path,status_code,duration_ms,session_id,country").gte("created_at", start14.toISOString()).order("created_at", { ascending: true }).limit(10000),
      admin.from("access_logs").select("id,user_id,path,status_code,duration_ms,ip_masked,country,city,user_agent,referrer,created_at").order("created_at", { ascending: false }).limit(80),
      admin.from("content_reports").select("id,reason,review_state,created_at,note_id,comment_id,reporter_id").order("created_at", { ascending: false }).limit(30),
    ]);

    const logs = logsResult.data ?? [];
    const daily = new Map<string, { date: string; visits: number; sessions: Set<string>; errors: number; totalDuration: number; durationCount: number }>();
    const topPaths = new Map<string, number>();
    for (let index = 0; index < 14; index += 1) {
      const date = new Date(start14.getTime() + index * 86400000).toISOString().slice(0, 10);
      daily.set(date, { date, visits: 0, sessions: new Set(), errors: 0, totalDuration: 0, durationCount: 0 });
    }
    for (const log of logs as any[]) {
      const date = String(log.created_at).slice(0, 10);
      const bucket = daily.get(date);
      if (bucket) {
        bucket.visits += 1;
        if (log.session_id) bucket.sessions.add(log.session_id);
        if (Number(log.status_code) >= 400) bucket.errors += 1;
        if (Number.isFinite(log.duration_ms)) {
          bucket.totalDuration += Number(log.duration_ms);
          bucket.durationCount += 1;
        }
      }
      topPaths.set(log.path, (topPaths.get(log.path) ?? 0) + 1);
    }
    const todayLogs = logs.filter((log: any) => new Date(log.created_at) >= today);
    const uniqueToday = new Set(todayLogs.map((log: any) => log.session_id).filter(Boolean)).size;
    return reply({
      summary: {
        users: profilesResult.count ?? 0,
        published_notes: notesResult.count ?? 0,
        comments: commentsResult.count ?? 0,
        pending_reports: pendingResult.count ?? 0,
        visits_today: todayLogs.length,
        unique_sessions_today: uniqueToday,
      },
      daily: Array.from(daily.values()).map((item) => ({
        date: item.date,
        visits: item.visits,
        unique_sessions: item.sessions.size,
        errors: item.errors,
        average_duration_ms: item.durationCount ? Math.round(item.totalDuration / item.durationCount) : 0,
      })),
      top_paths: Array.from(topPaths.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, visits]) => ({ path, visits })),
      recent_access: recentResult.data ?? [],
      reports: reportsResult.data ?? [],
    }, 200, headers);
  }

  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405, headers);
  let body: any;
  try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400, headers); }
  const action = String(body.action ?? "");
  const targetId = typeof body.target_id === "string" ? body.target_id : null;
  if (!targetId) return reply({ error: "target_required" }, 400, headers);

  let detail: Record<string, unknown> = {};
  if (action === "update_access") {
    const accessLevel = String(body.access_level ?? "member");
    const state = String(body.state ?? "enabled");
    if (!["member", "moderator", "administrator"].includes(accessLevel) || !["enabled", "disabled"].includes(state)) return reply({ error: "invalid_access_value" }, 400, headers);
    if (targetId === administratorId && state === "disabled") return reply({ error: "cannot_disable_self" }, 400, headers);
    const { data: current } = await admin.from("user_access").select("access_level").eq("user_id", targetId).maybeSingle();
    if (current?.access_level === "administrator" && accessLevel !== "administrator") {
      const { count } = await admin.from("user_access").select("user_id", { count: "exact", head: true }).eq("access_level", "administrator").eq("state", "enabled");
      if ((count ?? 0) <= 1) return reply({ error: "last_administrator" }, 400, headers);
    }
    const { error } = await admin.from("user_access").upsert({ user_id: targetId, access_level: accessLevel, state, updated_at: new Date().toISOString() });
    if (error) return reply({ error: error.message }, 500, headers);
    const { error: banError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: state === "disabled" ? "876000h" : "none" });
    if (banError) return reply({ error: banError.message }, 500, headers);
    detail = { access_level: accessLevel, state };
  } else if (action === "set_note_visibility") {
    const hidden = Boolean(body.hidden);
    const { error } = await admin.from("notes").update({ is_hidden: hidden, moderation_reason: hidden ? String(body.reason ?? "管理员隐藏") : null }).eq("id", targetId);
    if (error) return reply({ error: error.message }, 500, headers);
    detail = { hidden, reason: body.reason ?? null };
  } else if (action === "set_comment_visibility") {
    const hidden = Boolean(body.hidden);
    const { error } = await admin.from("comments").update({ is_hidden: hidden }).eq("id", targetId);
    if (error) return reply({ error: error.message }, 500, headers);
    detail = { hidden };
  } else if (action === "review_report") {
    const reviewState = String(body.review_state ?? "resolved");
    if (!["resolved", "dismissed"].includes(reviewState)) return reply({ error: "invalid_review_state" }, 400, headers);
    const { error } = await admin.from("content_reports").update({ review_state: reviewState, handled_by: administratorId, handled_at: new Date().toISOString() }).eq("id", targetId);
    if (error) return reply({ error: error.message }, 500, headers);
    detail = { review_state: reviewState };
  } else {
    return reply({ error: "unknown_action" }, 400, headers);
  }

  await admin.from("admin_audit_logs").insert({ administrator_id: administratorId, action, target_type: String(body.target_type ?? "unknown"), target_id: targetId, detail });
  return reply({ ok: true }, 200, headers);
});
