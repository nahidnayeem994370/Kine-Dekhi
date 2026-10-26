import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  let orderId: number | null = null;
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const testMode = (Deno.env.get("RESEND_TEST_MODE") || "true").toLowerCase() !== "false";
    const testTo = Deno.env.get("RESEND_TEST_TO_EMAIL") || "";
    if (!url || !serviceKey || !resendKey) throw new Error("Missing server secrets");
    if (testMode && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) throw new Error("RESEND_TEST_TO_EMAIL must be configured for test mode");
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await caller.auth.getUser(token);
    if (userError || userData.user?.app_metadata?.role !== "admin") return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json();
    orderId = Number(body.order_id);
    if (!Number.isSafeInteger(orderId) || orderId < 1) return new Response(JSON.stringify({ error: "Invalid order id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: order, error } = await db.from("orders").select("id,order_number,customer_email,tracking_token,order_status,confirmation_email_sent_at").eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (!order) return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (order.order_status !== "confirmed") return new Response(JSON.stringify({ skipped: true, reason: "Order is not confirmed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (order.confirmation_email_sent_at) return new Response(JSON.stringify({ skipped: true, reason: "Confirmation already sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const recipient = testMode ? testTo : order.customer_email;
    if (!recipient) throw new Error("Customer email missing");
    const trackingUrl = `https://nahidnayeem994370.github.io/Kine-Dekhi/track-order.html?token=${encodeURIComponent(order.tracking_token)}`;
    const subject = `Kine Dekhi অর্ডার কনফার্ম: ${order.order_number}`;
    const html = `<!doctype html><html lang="bn"><body style="font-family:Arial,sans-serif;color:#34151a;line-height:1.7"><div style="max-width:600px;margin:auto;padding:24px;border:1px solid #f3d6da;border-radius:16px"><h2 style="color:#c90019">Kine Dekhi</h2><h3>আপনার অর্ডার কনফার্ম হয়েছে!</h3><p>অর্ডার নম্বর: <strong>${order.order_number}</strong></p><p>আপনার অর্ডারের বর্তমান অবস্থা নিরাপদ লিংক থেকে দেখতে পারবেন।</p><p><a href="${trackingUrl}" style="display:inline-block;background:#c90019;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">অর্ডার ট্র্যাক করুন</a></p><p style="font-size:12px;color:#78656a">এই লিংকটি ব্যক্তিগত। অন্য কারও সঙ্গে শেয়ার করবেন না।</p>${testMode ? '<p style="background:#fff2cc;padding:10px">TEST MODE: এটি পরীক্ষামূলক ইমেইল; কাস্টমারকে পাঠানো হয়নি।</p>' : ''}</div></body></html>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Kine Dekhi <onboarding@resend.dev>", to: [recipient], subject, html }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Resend error ${response.status}: ${JSON.stringify(result)}`);
    await db.from("orders").update({ confirmation_email_sent_at: new Date().toISOString(), confirmation_email_error: null }).eq("id", orderId);
    return new Response(JSON.stringify({ success: true, test_mode: testMode, recipient }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("send-order-confirmation failed for order", orderId, e);
    try {
      const url = Deno.env.get("SUPABASE_URL");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (url && key && orderId) {
        const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        await db.from("orders").update({ confirmation_email_error: String(e).slice(0, 1000) }).eq("id", orderId);
      }
    } catch (logError) { console.error("Could not save email failure:", logError); }
    return new Response(JSON.stringify({ error: "ইমেইল পাঠানো যায়নি; অর্ডারের স্ট্যাটাস সেভ আছে। Supabase Function Logs দেখুন।" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
