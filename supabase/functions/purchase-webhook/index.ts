
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
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

function base64url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function deepGet(obj: any, paths: string[]) {
  for (const path of paths) {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) cur = cur?.[p];
    if (cur !== undefined && cur !== null && String(cur).trim() !== "") return cur;
  }
  return null;
}

function normalizeText(input: unknown) {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function inferOffer(input: unknown) {
  const s = normalizeText(input);
  if (!s) return "";
  if (["kit_basico","kit_completo","bump_pix","bump_celular","bump_fotos_ia"].includes(s)) return s;
  if (s.includes("kit") && s.includes("basico")) return "kit_basico";
  if (s.includes("kit") && s.includes("completo")) return "kit_completo";
  if (s.includes("pix")) return "bump_pix";
  if (s.includes("celular") && (s.includes("novo") || s.includes("configurar"))) return "bump_celular";
  if ((s.includes("foto") && s.includes("ia")) || s.includes("fotos antigas") || s.includes("renovadas")) return "bump_fotos_ia";
  return "";
}

function normalizeAction(input: unknown) {
  const s = normalizeText(input).replace(/[\\s.-]+/g, "_");

  // Estados sem liberação precisam ser avaliados antes de "paid",
  // pois "unpaid" contém a substring "paid".
  if ([
    "unpaid","pending","waiting_payment","credit_card_declined","declined",
    "failed","processing","created"
  ].includes(s)) return "ignored";

  if ([
    "refunded","refund","chargedback","chargeback","charged_back",
    "cancelled","canceled","reembolsado","reembolso","estorno"
  ].includes(s)) return "revoked";

  if ([
    "paid","approved","completed","complete","purchase_approved",
    "pago","aprovado","payment_success"
  ].includes(s)) return "approved";

  return "ignored";
}

async function findUser(admin: any, email: string) {
  const { data: profile } = await admin.from("profiles").select("user_id,email").eq("email", email).maybeSingle();
  if (profile?.user_id) return profile.user_id;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "purchase_webhook" },
  });
  if (!error && created?.user?.id) return created.user.id;

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = users?.users?.find((u: any) => String(u.email || "").toLowerCase() === email);
  return existing?.id || null;
}

async function mappedOffer(admin: any, provider: string, externalId: unknown, label: unknown) {
  const id = String(externalId ?? "").trim();
  if (id) {
    const { data } = await admin
      .from("external_offer_mappings")
      .select("offer_code")
      .eq("provider", provider)
      .eq("external_id", id)
      .maybeSingle();
    if (data?.offer_code) return data.offer_code;
  }
  return inferOffer(label);
}

async function collectOfferCodes(admin: any, provider: string, payload: any) {
  const codes = new Set<string>();

  const explicit = deepGet(payload, ["offer_code","product_code","plan","data.offer_code","data.product_code","data.plan"]);
  const explicitCode = inferOffer(explicit);
  if (explicitCode) codes.add(explicitCode);

  if (payload?.checkout) {
    const base = await mappedOffer(admin, provider, payload.checkout.id, payload.checkout.title);
    if (base) codes.add(base);

    if (Array.isArray(payload.checkout.orderbump)) {
      for (const item of payload.checkout.orderbump) {
        const code = await mappedOffer(admin, provider, item?.id, item?.title);
        if (code) codes.add(code);
      }
    }
  }

  if (Array.isArray(payload?.products)) {
    for (const item of payload.products) {
      const code = await mappedOffer(admin, provider, item?.id, item?.title);
      if (code) codes.add(code);
    }
  }

  const genericProduct = deepGet(payload, ["product","data.product"]);
  if (genericProduct && typeof genericProduct === "object") {
    const code = await mappedOffer(admin, provider, genericProduct.id, genericProduct.name || genericProduct.title);
    if (code) codes.add(code);
  }

  const rawOffer = deepGet(payload, ["offer.name","data.offer.name","product.name","data.product.name"]);
  const inferred = inferOffer(rawOffer);
  if (inferred) codes.add(inferred);

  return Array.from(codes);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return json({ ok: false }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const requestUrl = new URL(req.url);
    let suppliedKey =
      req.headers.get("x-webhook-key") ||
      req.headers.get("authorization") ||
      requestUrl.searchParams.get("key") ||
      "";
    suppliedKey = suppliedKey.replace(/^Bearer\s+/i, "").trim();

    if (!suppliedKey) return json({ ok: false }, 401);

    const { data: secretRow } = await admin
      .from("webhook_secrets")
      .select("secret_hash,active")
      .eq("provider", "generic_checkout")
      .maybeSingle();

    if (!secretRow?.active || !secretRow?.secret_hash || await sha256(suppliedKey) !== secretRow.secret_hash) {
      return json({ ok: false }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const isWiapy = Boolean(payload?.payment || payload?.checkout || payload?.customer);
    const provider = isWiapy
      ? "wiapy"
      : String(deepGet(payload, ["provider","source"]) ?? "generic_checkout").slice(0,80);

    const email = String(deepGet(payload, [
      "email","customer.email","buyer.email","client.email",
      "data.email","data.customer.email","data.buyer.email","data.client.email"
    ]) ?? "").trim().toLowerCase();

    const rawStatus = deepGet(payload, [
      "payment.status","event_type","event","status","type",
      "data.payment.status","data.event_type","data.event","data.status","data.type"
    ]);
    const action = normalizeAction(rawStatus);

    let externalEventId = String(deepGet(payload, [
      "payment.id","event_id","id","transaction_id","purchase_id","order_id",
      "data.payment.id","data.event_id","data.id","data.transaction_id","data.purchase_id","data.order_id"
    ]) ?? "").trim();
    if (!externalEventId) externalEventId = await sha256(JSON.stringify(payload));

    const offerCodes = await collectOfferCodes(admin, provider, payload);

    const { data: eventRow, error: eventError } = await admin
      .from("purchase_events")
      .insert({
        provider,
        external_event_id: externalEventId,
        event_type: String(rawStatus ?? action),
        customer_email: email || null,
        offer_code: offerCodes.join(",") || null,
        status: "received",
        payload,
      })
      .select("id")
      .single();

    if (eventError) {
      if (String(eventError.code) === "23505") return json({ ok: true, duplicate: true });
      console.error("purchase_events insert", eventError);
      return json({ ok: false }, 500);
    }

    if (!email || !offerCodes.length || action === "ignored") {
      await admin.from("purchase_events").update({
        status: "ignored",
        processed_at: new Date().toISOString(),
        error_message: !email ? "missing_email" : !offerCodes.length ? "unknown_offer" : "ignored_event",
      }).eq("id", eventRow.id);
      return json({ ok: true, ignored: true });
    }

    const userId = await findUser(admin, email);
    if (!userId) {
      await admin.from("purchase_events").update({
        status: "failed",
        processed_at: new Date().toISOString(),
        error_message: "user_create_failed",
      }).eq("id", eventRow.id);
      return json({ ok: false }, 500);
    }

    const purchaseId = String(deepGet(payload, [
      "payment.id","purchase_id","transaction_id","order_id","id",
      "data.payment.id","data.purchase_id","data.transaction_id","data.order_id","data.id"
    ]) ?? externalEventId);

    const productCodes = new Set<string>();
    for (const offerCode of offerCodes) {
      const { data: mappings, error: mapError } = await admin
        .from("offer_entitlements")
        .select("product_code")
        .eq("offer_code", offerCode);
      if (mapError) throw mapError;
      (mappings || []).forEach((m: any) => productCodes.add(m.product_code));
    }

    if (!productCodes.size) {
      await admin.from("purchase_events").update({
        status: "failed",
        processed_at: new Date().toISOString(),
        error_message: "offer_mapping_missing",
      }).eq("id", eventRow.id);
      return json({ ok: false }, 500);
    }

    if (action === "approved") {
      for (const productCode of productCodes) {
        const { error } = await admin.from("user_entitlements").upsert({
          user_id: userId,
          product_code: productCode,
          status: "active",
          source: provider,
          purchase_id: purchaseId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,product_code" });
        if (error) throw error;
      }

      const random = new Uint8Array(32);
      crypto.getRandomValues(random);
      const rawToken = base64url(random);
      const tokenHash = await sha256(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await admin.from("purchase_access_tokens").insert({
        user_id: userId,
        token_hash: tokenHash,
        purchase_id: purchaseId,
        expires_at: expiresAt,
      });

      const { data: appSetting } = await admin.from("app_settings").select("value").eq("key","member_app_url").maybeSingle();
      const base = String(appSetting?.value || "").replace(/\/+$/, "");
      const accessUrl = base ? `${base}/?access=${encodeURIComponent(rawToken)}` : "";

      await admin.from("purchase_notifications").insert({
        purchase_event_id: eventRow.id,
        user_id: userId,
        recipient_email: email,
        access_url: accessUrl,
        status: "pending",
      });

      await admin.from("purchase_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("id", eventRow.id);

      return json({
        ok: true,
        action: "approved",
        provider,
        offers: offerCodes,
        entitlements: Array.from(productCodes),
        access_url: accessUrl,
        notification_status: "pending_email_provider",
      });
    }

    for (const productCode of productCodes) {
      const { error } = await admin
        .from("user_entitlements")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("product_code", productCode);
      if (error) throw error;
    }

    await admin.from("purchase_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("id", eventRow.id);

    return json({ ok: true, action: "revoked", provider, offers: offerCodes });
  } catch (error) {
    console.error("purchase-webhook unexpected error", error);
    return json({ ok: false }, 500);
  }
});
