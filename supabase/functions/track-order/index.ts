import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const { token } = await req.json();
    if (typeof token !== "string" || !/^[a-f0-9-]{36}$/i.test(token)) {
      return new Response(JSON.stringify({ error: "ট্র্যাকিং লিংকটি সঠিক নয়।" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server configuration missing");
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("orders").select("order_number,order_status,created_at").eq("tracking_token", token).maybeSingle();
    if (error) throw error;
    if (!data) return new Response(JSON.stringify({ error: "এই ট্র্যাকিং লিংক পাওয়া যায়নি।" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ order_number: data.order_number, status: data.order_status, created_at: data.created_at ?? null }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("track-order failed:", e);
    return new Response(JSON.stringify({ error: "ট্র্যাকিং তথ্য এখন পাওয়া যাচ্ছে না। পরে আবার চেষ্টা করুন।" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
