import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const statusLabels: Record<string, string> = {
  pending: "অর্ডার অপেক্ষমাণ",
  confirmed: "অর্ডার কনফার্ম হয়েছে",
  processing: "অর্ডার প্রস্তুত করা হচ্ছে",
  shipped: "কুরিয়ারে পাঠানো হয়েছে",
  delivered: "ডেলিভারি সম্পন্ন",
  cancelled: "অর্ডার বাতিল",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return Response.json({ error: "Admin login required" }, { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("ORDER_EMAIL_FROM");
    const adminEmails = (Deno.env.get("ORDER_EMAIL_ADMIN_ALLOWLIST") || "")
      .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

    if (!supabaseUrl || !anonKey || !serviceKey || !resendKey || !fromEmail || !adminEmails.length) {
      return Response.json({ error: "Email function secrets are incomplete. Configure RESEND_API_KEY, ORDER_EMAIL_FROM, and ORDER_EMAIL_ADMIN_ALLOWLIST." }, { status: 500, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const userEmail = userData?.user?.email?.toLowerCase();
    if (userError || !userEmail || !adminEmails.includes(userEmail)) {
      return Response.json({ error: "This account is not authorized to send order emails." }, { status: 403, headers: corsHeaders });
    }

    const { order_id, status } = await req.json();
    if (!Number.isFinite(Number(order_id)) || !statusLabels[String(status)]) {
      return Response.json({ error: "Valid order_id and status are required." }, { status: 400, headers: corsHeaders });
    }

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: order, error } = await db.from("orders")
      .select("id,order_number,customer_name,customer_email,order_status")
      .eq("id", Number(order_id)).maybeSingle();

    if (error || !order) {
      return Response.json({ error: error?.message || "Order not found" }, { status: 404, headers: corsHeaders });
    }
    if (order.order_status !== status) {
      return Response.json({ error: "Order status has not been saved yet." }, { status: 409, headers: corsHeaders });
    }
    if (!order.customer_email) {
      return Response.json({ skipped: true, reason: "এই অর্ডারে কাস্টমারের ইমেইল নেই।" }, { headers: corsHeaders });
    }

    const subject = `Kine Dekhi: অর্ডার ${order.order_number} — ${statusLabels[status]}`;
    const html = `<!doctype html><html lang="bn"><body style="margin:0;background:#f7f8fa;font-family:Arial,sans-serif;color:#222;padding:24px"><main style="max-width:560px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px"><h2 style="color:#0f766e">Kine Dekhi</h2><p>প্রিয় ${escapeHtml(order.customer_name || "ক্রেতা")},</p><p>আপনার অর্ডার <strong>${escapeHtml(order.order_number)}</strong>-এর স্ট্যাটাস আপডেট হয়েছে।</p><div style="padding:14px;background:#ecfdf5;border-radius:10px;font-size:18px;font-weight:bold">${statusLabels[status]}</div><p>আরও তথ্যের জন্য Kine Dekhi ওয়েবসাইটের অর্ডার ট্র্যাকিং লিংক ব্যবহার করুন।</p><p style="color:#6b7280;font-size:12px">এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে।</p></main></body></html>`;

    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [order.customer_email], subject, html }),
    });
    const result = await mail.json().catch(() => ({}));
    if (!mail.ok) {
      console.error("Resend email error", mail.status, result);
      return Response.json({ error: result?.message || "Email provider rejected the message." }, { status: 502, headers: corsHeaders });
    }
    return Response.json({ success: true, email_id: result.id }, { headers: corsHeaders });
  } catch (e) {
    console.error("send-order-status-email error", e);
    return Response.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500, headers: corsHeaders });
  }
});

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
