// Kine dekhi secure order Edge Function.
// Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as Supabase Edge Function secrets.
// Never expose the service-role key in frontend code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const customer_name = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const customer_email = typeof body.customer_email === "string" ? body.customer_email.trim().toLowerCase() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const payment_method = body.payment_method;
    const division_name = typeof body.division_name === "string" ? body.division_name.trim() : "";
    const items = body.items;

    if (customer_name.length < 2 || customer_name.length > 120 ||
        phone.length < 8 || phone.length > 20 ||
        customer_email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(customer_email) ||
        address.length < 8 || address.length > 500 ||
        !["ঢাকা","চট্টগ্রাম","রাজশাহী","খুলনা","বরিশাল","সিলেট","রংপুর","ময়মনসিংহ"].includes(division_name) ||
        !["cod", "bkash", "nagad"].includes(payment_method) ||
        !Array.isArray(items) || items.length < 1 || items.length > 30) {
      return new Response(JSON.stringify({ error: "তথ্যগুলো যাচাই করে আবার চেষ্টা করুন।" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server configuration missing");

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("create_order_secure", {
      p_customer_name: customer_name,
      p_phone: phone,
      p_address: address,
      p_division_name: division_name,
      p_payment_method: payment_method,
      p_items: items,
      p_customer_email: customer_email,
      p_tracking_token: crypto.randomUUID(),
    });

    if (error) {
      // Keep the detailed database error in Supabase Edge Function logs for diagnosis.
      console.error("create_order_secure RPC failed:", error.code, error.message, error.details, error.hint);
      const raw = [error.message, error.details, error.hint].filter(Boolean).join(" ");
      let safeMessage = "ডেটাবেস অর্ডার তৈরি করতে পারেনি। Supabase create-order Logs-এ RPC error দেখুন।";
      if (/unavailable|insufficient stock|stock|quantity|product|duplicate/i.test(raw)) {
        safeMessage = "কার্টের কোনো পণ্য পাওয়া যাচ্ছে না বা পর্যাপ্ত স্টক নেই। কার্ট যাচাই করুন।";
      } else if (/function .* does not exist|could not find the function|schema cache/i.test(raw)) {
        safeMessage = "ডেটাবেসের create_order_secure ফাংশনের সংজ্ঞা মেলেনি। SQL migration আবার যাচাই করুন।";
      } else if (/invalid customer name|invalid phone number|invalid delivery address|invalid division|invalid payment method|invalid order items/i.test(raw)) {
        safeMessage = "নাম, ফোন, বিভাগ, ঠিকানা, পেমেন্ট ও কার্টের তথ্য যাচাই করে আবার চেষ্টা করুন।";
      }
      return new Response(JSON.stringify({ error: safeMessage }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = data && typeof data === "object" ? data : {};
    const trackingToken = (await supabase.from("orders").select("tracking_token").eq("order_number", result.order_number).maybeSingle()).data?.tracking_token;
    const trackingUrl = trackingToken ? `https://nahidnayeem994370.github.io/Kine-Dekhi/track-order.html?token=${encodeURIComponent(trackingToken)}` : null;
    return new Response(JSON.stringify({ ...result, tracking_url: trackingUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_error) {
    return new Response(JSON.stringify({ error: "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
