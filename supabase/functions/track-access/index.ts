import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const productionOrigin = "https://rrrrbook.netlify.app";
const localOrigins = new Set(["http://localhost:5173", "http://localhost:4173"]);

function isAllowedOrigin(origin: string) {
  return origin === productionOrigin || localOrigins.has(origin) || /^https:\/\/[a-z0-9-]+--rrrrbook\.netlify\.app$/.test(origin);
}

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : productionOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function maskIp(raw: string | null) {
  if (!raw) return null;
  const ip = raw.split(",")[0].trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}::`;
  return null;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  if (!isAllowedOrigin(origin)) return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers }); }

  const path = text(payload.path, 300);
  if (!path || !path.startsWith("/")) return new Response(JSON.stringify({ error: "invalid_path" }), { status: 400, headers });

  let userId: string | null = null;
  const authorization = req.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const { data } = await admin.auth.getUser(authorization.slice(7));
    userId = data.user?.id ?? null;
  }

  const sessionId = text(payload.session_id, 120);
  if (sessionId) {
    const { data: duplicate } = await admin.from("access_logs").select("id").eq("session_id", sessionId).eq("path", path).gte("created_at", new Date(Date.now() - 10000).toISOString()).limit(1);
    if (duplicate?.length) return new Response(JSON.stringify({ ok: true, deduplicated: true }), { status: 200, headers });
  }

  const duration = Number(payload.duration_ms);
  const statusCode = Number(payload.status_code);
  const { error } = await admin.from("access_logs").insert({
    user_id: userId,
    session_id: sessionId,
    path,
    method: text(payload.method, 20) ?? "PAGEVIEW",
    status_code: Number.isFinite(statusCode) ? Math.max(100, Math.min(599, Math.round(statusCode))) : 200,
    duration_ms: Number.isFinite(duration) ? Math.max(0, Math.min(600000, Math.round(duration))) : null,
    ip_masked: maskIp(req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip")),
    country: text(req.headers.get("cf-ipcountry") ?? req.headers.get("x-country"), 80),
    city: text(req.headers.get("x-city"), 120),
    user_agent: text(req.headers.get("user-agent"), 500),
    referrer: text(payload.referrer, 500),
    metadata: typeof payload.metadata === "object" && payload.metadata !== null ? payload.metadata : {},
  });

  if (userId) await admin.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
  if (error) return new Response(JSON.stringify({ error: "log_failed" }), { status: 500, headers });
  return new Response(JSON.stringify({ ok: true }), { status: 201, headers });
});
