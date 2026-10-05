
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return json({ ok: false, message: "Serviço indisponível." }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, message: "Digite o mesmo e-mail usado na compra." }, 400);
    }

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const ip = req.headers.get("cf-connecting-ip") || forwarded || "unknown";
    const emailHash = await sha256(email);
    const ipHash = await sha256(ip);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const [{ count: emailCount }, { count: ipCount }] = await Promise.all([
      admin.from("member_login_attempts").select("*", { count: "exact", head: true }).eq("email_hash", emailHash).gte("created_at", since),
      admin.from("member_login_attempts").select("*", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since),
    ]);

    if ((emailCount ?? 0) >= 6 || (ipCount ?? 0) >= 30) {
      await admin.from("member_login_attempts").insert({ email_hash: emailHash, ip_hash: ipHash, success: false });
      return json({ ok: false, message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, 429);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("user_id,email")
      .eq("email", email)
      .maybeSingle();

    if (!profile?.user_id) {
      await admin.from("member_login_attempts").insert({ email_hash: emailHash, ip_hash: ipHash, success: false });
      return json({ ok: false, message: "Não foi possível liberar o acesso com esse e-mail." }, 200);
    }

    const { count: entitlementCount } = await admin
      .from("user_entitlements")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.user_id)
      .eq("status", "active");

    if ((entitlementCount ?? 0) < 1) {
      await admin.from("member_login_attempts").insert({ email_hash: emailHash, ip_hash: ipHash, success: false });
      return json({ ok: false, message: "Não foi possível liberar o acesso com esse e-mail." }, 200);
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error("generateLink error", linkError);
      await admin.from("member_login_attempts").insert({ email_hash: emailHash, ip_hash: ipHash, success: false });
      return json({ ok: false, message: "Não foi possível entrar agora. Tente novamente em alguns instantes." }, 500);
    }

    await admin.from("member_login_attempts").insert({ email_hash: emailHash, ip_hash: ipHash, success: true });

    return json({
      ok: true,
      token_hash: tokenHash,
      type: "email",
    });
  } catch (error) {
    console.error("member-login unexpected error", error);
    return json({ ok: false, message: "Não foi possível entrar agora. Tente novamente." }, 500);
  }
});
