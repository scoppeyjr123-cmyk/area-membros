
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
    const token = String(body?.token ?? "").trim();
    if (!token || token.length < 24) {
      return json({ ok: false, message: "Link de acesso inválido." }, 400);
    }

    const tokenHash = await sha256(token);
    const now = new Date().toISOString();

    const { data: row, error: tokenError } = await admin
      .from("purchase_access_tokens")
      .select("id,user_id,expires_at,used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError || !row || row.used_at || row.expires_at <= now) {
      return json({ ok: false, message: "Este link de acesso não é mais válido." }, 200);
    }

    const { data: claimed, error: claimError } = await admin
      .from("purchase_access_tokens")
      .update({ used_at: now })
      .eq("id", row.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();

    if (claimError || !claimed) {
      return json({ ok: false, message: "Este link de acesso já foi utilizado." }, 200);
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(row.user_id);
    const email = userData?.user?.email?.toLowerCase();

    if (userError || !email) {
      console.error("purchase-access getUser error", userError);
      return json({ ok: false, message: "Não foi possível liberar o acesso." }, 500);
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    const authTokenHash = linkData?.properties?.hashed_token;
    if (linkError || !authTokenHash) {
      console.error("purchase-access generateLink error", linkError);
      return json({ ok: false, message: "Não foi possível liberar o acesso." }, 500);
    }

    return json({ ok: true, token_hash: authTokenHash, type: "email" });
  } catch (error) {
    console.error("purchase-access unexpected error", error);
    return json({ ok: false, message: "Não foi possível liberar o acesso." }, 500);
  }
});
