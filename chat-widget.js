import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

(() => {
  const SUPABASE_URL = "https://jyrzdtitmdsxzxtxhecu.supabase.co";
  const SUPABASE_KEY = "sb_publishable_saBTFA1ddc3ICx3t_sPjiw_BKjGLl5o";
  const API_URL = SUPABASE_URL + "/functions/v1/chat-api";
  const db = createClient(SUPABASE_URL, SUPABASE_KEY);
  const isAdminPage = /(?:^|\/)admin\.html$/i.test(location.pathname);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
  const timeLabel = value => {
    try { return new Date(value).toLocaleTimeString("bn-BD", { hour:"2-digit", minute:"2-digit" }); }
    catch { return ""; }
  };
  const getVisitorToken = () => {
    let token = "";
    try { token = localStorage.getItem("kd_chat_visitor_token") || ""; } catch {}
    if (!/^[a-f0-9-]{32,128}$/i.test(token)) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      token = Array.from(bytes).map(n => n.toString(16).padStart(2,"0")).join("");
      try { localStorage.setItem("kd_chat_visitor_token", token); } catch {}
    }
    return token;
  };
  const visitorToken = getVisitorToken();
  const SHOP_BASE = new URL("./", new URL("./index.html", location.href));
  let adminSession = null;
  let isOpen = false;
  let activeConversation = null;
  let activeMessages = [];
  let adminConversations = [];
  let isDragging = false;
  let moved = false;
  let dragOffset = {x:0,y:0};
  let startPoint = {x:0,y:0};
  let pollTimer = null;
  let inboxTimer = null;
  let lastCustomerRender = "";
  let lastAdminRender = "";

  const style = document.createElement("style");
  style.textContent = `
  #kdChatBubble{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:0;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;box-shadow:0 5px 18px #4c1d9560;width:46px;min-width:46px;height:46px;padding:0;display:flex;align-items:center;justify-content:center;gap:0;font:800 12px system-ui,sans-serif;touch-action:none;user-select:none;cursor:grab} #kdChatBubble span:not(#kdChatBadge){display:none}
  #kdChatBubble svg{width:22px;height:22px;flex:0 0 22px}
  #kdChatBubble:active{cursor:grabbing}
  #kdChatBadge{position:absolute;right:-3px;top:-4px;background:#ef4444;color:#fff;border:2px solid #fff;border-radius:999px;min-width:19px;height:19px;font:800 11px system-ui;display:none;align-items:center;justify-content:center;padding:0 4px}
  #kdChatPanel{position:fixed;z-index:2147482999;width:min(310px,calc(100vw - 18px));height:min(430px,calc(100dvh - 86px));background:#fff;border:1px solid #eadcf5;border-radius:18px;box-shadow:0 18px 60px #2e10652b;display:none;overflow:hidden;color:#241a35;font:14px system-ui,-apple-system,"Noto Sans Bengali",sans-serif}
  #kdChatPanel.kd-open{display:flex;flex-direction:column}
  #kdChatHeader{background:linear-gradient(110deg,#6d28d9,#c026d3);color:#fff;display:flex;align-items:center;gap:10px;padding:13px 14px;min-height:61px}
  #kdChatHeader .kd-title{font-weight:900;font-size:15px;flex:1;line-height:1.35}
  #kdChatHeader .kd-sub{display:block;font-size:11px;font-weight:500;opacity:.88;margin-top:2px}
  .kd-head-btn{border:0;background:#ffffff26;color:#fff;border-radius:9px;width:32px;height:32px;font-size:19px;display:grid;place-items:center;padding:0}
  #kdChatBody{flex:1;min-height:0;display:flex;flex-direction:column;background:#fcfaff}
  #kdChatMessages{flex:1;overflow-y:auto;padding:13px;display:flex;flex-direction:column;gap:9px;overscroll-behavior:contain}
  .kd-msg{max-width:86%;padding:9px 11px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;font-size:13px}
  .kd-msg.kd-mine{align-self:flex-end;background:#7c3aed;color:#fff;border-bottom-right-radius:4px}
  .kd-msg.kd-theirs{align-self:flex-start;background:#f0e9f8;color:#2d2140;border-bottom-left-radius:4px}
  .kd-msg time{display:block;font-size:10px;opacity:.72;text-align:right;margin-top:3px}
  #kdChatEmpty{margin:auto;text-align:center;color:#766985;font-size:13px;line-height:1.8;padding:20px}
  #kdChatForm{display:flex;gap:5px;padding:8px;border-top:1px solid #eee5f7;background:#fff;align-items:flex-end} .kd-attach{width:36px;min-width:36px;height:40px;border:1px solid #ded1ed;border-radius:10px;background:#fff;color:#7c3aed;font-size:18px;display:grid;place-items:center;padding:0}.kd-file-input{display:none}.kd-msg img{display:block;max-width:100%;max-height:190px;object-fit:contain;border-radius:9px}.kd-msg a{color:inherit;text-decoration:underline;overflow-wrap:anywhere}.kd-msg.kd-mine a{color:#fff}
  #kdChatInput{flex:1;min-width:0;resize:none;max-height:92px;min-height:40px;border:1px solid #ded1ed;border-radius:12px;padding:10px;font:13px system-ui,sans-serif;outline:none}
  #kdChatInput:focus{border-color:#a855f7;box-shadow:0 0 0 3px #a855f71c}
  #kdChatSend{border:0;border-radius:11px;background:#7c3aed;color:#fff;font-weight:900;padding:0 10px;min-width:48px;height:40px}
  #kdChatSend:disabled{opacity:.55}
  #kdChatNotice{padding:5px 12px;color:#b91c1c;background:#fff1f2;font-size:12px;display:none}
  #kdChatAdminLayout{display:flex;flex:1;min-height:0}
  #kdChatInbox{width:122px;flex:0 0 122px;overflow-y:auto;border-right:1px solid #eee5f7;background:#fff}
  .kd-thread{display:block;width:100%;border:0;border-bottom:1px solid #f0e9f7;text-align:left;padding:10px 8px;background:#fff;color:#2d2140;font:12px system-ui;overflow-wrap:anywhere}
  .kd-thread.kd-selected{background:#f3e8ff;border-left:3px solid #7c3aed;padding-left:5px}
  .kd-thread b{display:block;font-size:12px;margin-bottom:3px}
  .kd-thread small{display:block;color:#746783;line-height:1.4}
  #kdChatAdminThread{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column}
  #kdChatAdminThread #kdChatMessages{padding:9px}
  #kdChatAdminTools{display:flex;gap:5px;padding:6px 9px;background:#fff;border-top:1px solid #eee5f7}
  #kdChatAdminTools button{border:1px solid #e5d7f2;border-radius:8px;background:#fff;padding:5px 7px;font-size:11px;color:#6d28d9}
  #kdChatStatusLine{font-size:11px;color:#6b5a7c;padding:4px 10px;background:#fff}
  @media(max-width:430px){#kdChatBubble{right:12px;bottom:14px;height:44px;width:44px;min-width:44px;padding:0}#kdChatPanel{width:calc(100vw - 18px);max-width:310px;height:min(430px,calc(100dvh - 78px));border-radius:14px}#kdChatInbox{width:100px;flex-basis:100px}.kd-thread{padding:9px 6px;font-size:11px}}
  `;
  document.head.appendChild(style);

  const bubble = document.createElement("button");
  bubble.id = "kdChatBubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", "Chat খুলুন");
  bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3.3-.7L4 20l1.7-4.1a7.4 7.4 0 0 1-1.2-4.4A7.5 7.5 0 0 1 12 4h.5A7.5 7.5 0 0 1 20 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><span>Chat</span><span id="kdChatBadge"></span>';
  const panel = document.createElement("section");
  panel.id = "kdChatPanel";
  panel.setAttribute("aria-label", "লাইভ চ্যাট");
  panel.innerHTML = '<div id="kdChatHeader"><div class="kd-title" id="kdChatHeading">Kine Dekhi Chat<span class="kd-sub" id="kdChatSubtitle">আমরা আপনাকে সাহায্য করতে এখানে আছি</span></div><button class="kd-head-btn" id="kdChatClose" type="button" aria-label="বন্ধ করুন">×</button></div><div id="kdChatNotice"></div><div id="kdChatBody"></div>';
  document.body.append(bubble, panel);
  const body = panel.querySelector("#kdChatBody");
  const notice = panel.querySelector("#kdChatNotice");
  const badge = bubble.querySelector("#kdChatBadge");
  const messagesHost = () => panel.querySelector("#kdChatMessages");

  function showNotice(message) {
    notice.textContent = message || "";
    notice.style.display = message ? "block" : "none";
  }
  async function api(action, payload = {}, admin = false) {
    const headers = { "Content-Type":"application/json", "apikey":SUPABASE_KEY };
    if (admin && adminSession?.access_token) headers.Authorization = "Bearer " + adminSession.access_token;
    const response = await fetch(API_URL, { method:"POST", headers, body:JSON.stringify({ action, ...payload, ...(!admin ? { visitor_token:visitorToken } : {}) }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "চ্যাটে সমস্যা হয়েছে।");
    return data;
  }
  function setPanelPosition() {
    const rect = bubble.getBoundingClientRect();
    const width = Math.min(310, window.innerWidth - 18);
    const height = Math.min(430, window.innerHeight - 86);
    let left = rect.left > window.innerWidth / 2 ? rect.right - width : rect.left;
    left = Math.max(10, Math.min(window.innerWidth - width - 10, left));
    let top = rect.top - height - 10;
    if (top < 10) top = Math.min(window.innerHeight - height - 10, rect.bottom + 10);
    top = Math.max(10, Math.min(window.innerHeight - height - 10, top));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }
  function restoreBubblePosition() {
    try {
      const raw = localStorage.getItem("kd_chat_bubble_position");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        bubble.style.left = Math.max(0, Math.min(innerWidth - bubble.offsetWidth, p.x)) + "px";
        bubble.style.top = Math.max(0, Math.min(innerHeight - bubble.offsetHeight, p.y)) + "px";
        bubble.style.right = "auto"; bubble.style.bottom = "auto";
      }
    } catch {}
  }
  function saveBubblePosition() {
    const r = bubble.getBoundingClientRect();
    try { localStorage.setItem("kd_chat_bubble_position", JSON.stringify({x:r.left,y:r.top})); } catch {}
  }
  bubble.addEventListener("pointerdown", event => {
    isDragging = true; moved = false;
    const r = bubble.getBoundingClientRect();
    dragOffset = { x:event.clientX-r.left, y:event.clientY-r.top };
    startPoint = { x:event.clientX, y:event.clientY };
    bubble.setPointerCapture?.(event.pointerId);
  });
  bubble.addEventListener("pointermove", event => {
    if (!isDragging) return;
    if (Math.abs(event.clientX-startPoint.x)+Math.abs(event.clientY-startPoint.y)>8) moved = true;
    if (!moved) return;
    bubble.style.left = Math.max(0, Math.min(innerWidth-bubble.offsetWidth, event.clientX-dragOffset.x)) + "px";
    bubble.style.top = Math.max(0, Math.min(innerHeight-bubble.offsetHeight, event.clientY-dragOffset.y)) + "px";
    bubble.style.right = "auto"; bubble.style.bottom = "auto";
    if (isOpen) setPanelPosition();
  });
  bubble.addEventListener("pointerup", () => {
    if (!isDragging) return;
    isDragging = false;
    if (moved) saveBubblePosition();
  });
  bubble.addEventListener("pointercancel", () => { isDragging = false; });
  bubble.addEventListener("click", async () => {
    if (moved) { moved = false; return; }
    isOpen = !isOpen;
    panel.classList.toggle("kd-open", isOpen);
    if (isOpen) {
      setPanelPosition();
      if (isAdminPage) await initAdminPanel();
      else await initCustomerPanel();
    } else {
      stopPolling();
    }
  });
  panel.querySelector("#kdChatClose").addEventListener("click", () => {
    isOpen = false; panel.classList.remove("kd-open"); stopPolling();
  });
  window.addEventListener("resize", () => { restoreBubblePosition(); if (isOpen) setPanelPosition(); });
  restoreBubblePosition();

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (inboxTimer) clearInterval(inboxTimer);
    pollTimer = null; inboxTimer = null;
  }
  function renderMessages(host, messages, mode) {
    const key = messages.map(m => m.id + ":" + m.sender_role + ":" + m.body + ":" + m.created_at).join("|");
    const lastKey = mode === "admin" ? lastAdminRender : lastCustomerRender;
    if (key === lastKey && host.children.length) return;
    if (mode === "admin") lastAdminRender = key; else lastCustomerRender = key;
    host.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement("div"); empty.id = "kdChatEmpty";
      empty.textContent = mode === "admin" ? "ক্রেতাকে উত্তর দিন—কথোপকথন এখানে দেখা যাবে।" : "আপনার প্রশ্নটি লিখে পাঠান। আমরা যত দ্রুত সম্ভব উত্তর দেব।";
      host.appendChild(empty); return;
    }
    for (const m of messages) {
      const item = document.createElement("div");
      item.className = "kd-msg " + ((mode === "admin" ? m.sender_role === "admin" : m.sender_role === "customer") ? "kd-mine" : "kd-theirs");
      const bodyText = String(m.body || "");
      if (bodyText.startsWith("IMAGE:")) {
        const url = bodyText.slice(6).trim();
        if (/^https:\/\//i.test(url)) {
          const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
          const image = document.createElement("img"); image.src = url; image.alt = "চ্যাটে পাঠানো ছবি"; image.loading = "lazy";
          link.appendChild(image); item.appendChild(link);
        } else { item.appendChild(document.createTextNode("ছবি পাওয়া যায়নি")); }
      } else {
        const urlPattern = /https?:\/\/[^\s<>]+/gi;
        let cursor = 0, match;
        while ((match = urlPattern.exec(bodyText))) {
          if (match.index > cursor) item.appendChild(document.createTextNode(bodyText.slice(cursor, match.index)));
          const raw = match[0].replace(/[),.!?\]}]+$/g, "");
          const trailing = match[0].slice(raw.length);
          let href = raw, isProductLink = false;
          try {
            const parsed = new URL(raw);
            const productId = parsed.searchParams.get("orderProduct") || parsed.searchParams.get("addProduct") || parsed.searchParams.get("productId") || parsed.searchParams.get("product_id") || parsed.searchParams.get("product") || parsed.searchParams.get("id");
            if (productId && (/github\.io$/i.test(parsed.hostname) || parsed.origin === location.origin)) {
              const target = new URL(SHOP_BASE.href); target.searchParams.set("orderProduct", productId); href = target.href; isProductLink = true;
            }
          } catch {}
          const anchor = document.createElement("a"); anchor.href = href; anchor.textContent = raw;
          if (!isProductLink) { anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; }
          item.appendChild(anchor);
          if (trailing) item.appendChild(document.createTextNode(trailing));
          cursor = match.index + match[0].length;
        }
        if (cursor < bodyText.length) item.appendChild(document.createTextNode(bodyText.slice(cursor)));
      }
      const time = document.createElement("time"); time.textContent = timeLabel(m.created_at);
      item.appendChild(time); host.appendChild(item);
    }
    host.scrollTop = host.scrollHeight;
  }
  async function sendChatImage(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 3 * 1024 * 1024) {
      showNotice("শুধু JPG, PNG বা WEBP ছবি পাঠান (সর্বোচ্চ ৩ MB)।"); return;
    }
    if (isAdminPage && !activeConversation) { showNotice("আগে ইনবক্স থেকে একটি ক্রেতার চ্যাট বেছে নিন।"); return; }
    const input = panel.querySelector("#kdChatInput");
    const send = panel.querySelector("#kdChatSend");
    const fileInput = panel.querySelector("#kdChatFile");
    if (send) send.disabled = true;
    showNotice("ছবি আপলোড হচ্ছে…");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("ছবি পড়া যায়নি।"));
        reader.readAsDataURL(file);
      });
      const action = isAdminPage ? "admin_upload" : "customer_upload";
      const payload = { image_base64:dataUrl, mime_type:file.type };
      if (isAdminPage) payload.conversation_id = activeConversation.id;
      const result = await api(action, payload, isAdminPage);
      if (!result.image_url) throw new Error("ছবি আপলোড হয়নি।");
      if (isAdminPage) {
        await api("admin_send", { conversation_id:activeConversation.id, message:"IMAGE:" + result.image_url }, true);
        await refreshAdminThread(); await refreshAdminInbox();
      } else {
        await api("customer_send", { message:"IMAGE:" + result.image_url });
        await refreshCustomer();
      }
      showNotice("");
    } catch (error) { showNotice(error.message || "ছবি পাঠানো যায়নি।"); }
    finally { if (send) send.disabled = false; if (fileInput) fileInput.value = ""; if (input) input.focus(); }
  }
  function wireImagePicker() {
    const pick = panel.querySelector("#kdChatAttach");
    const file = panel.querySelector("#kdChatFile");
    if (pick && file) {
      pick.addEventListener("click", () => file.click());
      file.addEventListener("change", () => sendChatImage(file.files?.[0]));
    }
  }
  function renderCustomerLayout() {
    body.innerHTML = '<div id="kdChatMessages"></div><form id="kdChatForm"><input class="kd-file-input" id="kdChatFile" type="file" accept="image/jpeg,image/png,image/webp"><button class="kd-attach" id="kdChatAttach" type="button" aria-label="ছবি পাঠান" title="ছবি পাঠান">📎</button><textarea id="kdChatInput" maxlength="1000" rows="1" placeholder="মেসেজ লিখুন…" aria-label="মেসেজ লিখুন"></textarea><button id="kdChatSend" type="submit">পাঠান</button></form>';
    panel.querySelector("#kdChatHeading").childNodes[0].textContent = "Kine Dekhi Chat";
    panel.querySelector("#kdChatSubtitle").textContent = "ক্রেতা সেবা • সরাসরি মেসেজ";
    wireImagePicker();
    const form = body.querySelector("#kdChatForm");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const input = body.querySelector("#kdChatInput");
      const send = body.querySelector("#kdChatSend");
      const message = input.value.trim();
      if (!message) return;
      send.disabled = true; showNotice("");
      try {
        await api("customer_send", { message });
        input.value = "";
        await refreshCustomer();
      } catch (error) { showNotice(error.message); }
      finally { send.disabled = false; input.focus(); }
    });
    refreshCustomer().catch(error => showNotice(error.message));
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshCustomer().catch(() => {}), 4000);
  }
  async function refreshCustomer() {
    const data = await api("customer_fetch");
    activeConversation = data.conversation;
    activeMessages = data.messages || [];
    const host = messagesHost();
    if (host) renderMessages(host, activeMessages, "customer");
    const input = panel.querySelector("#kdChatInput");
    const send = panel.querySelector("#kdChatSend");
    if (data.conversation?.status === "closed") {
      if (input) input.disabled = true;
      if (send) send.disabled = true;
      showNotice("এই কথোপকথনটি বন্ধ করা হয়েছে।");
    } else {
      if (input) input.disabled = false;
      if (send) send.disabled = false;
      if (!notice.textContent.includes("মেসেজ লিখুন")) showNotice("");
    }
  }
  async function initCustomerPanel() {
    if (!body.querySelector("#kdChatForm")) renderCustomerLayout();
    try { await api("customer_init"); await refreshCustomer(); }
    catch (error) { showNotice(error.message); }
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshCustomer().catch(() => {}), 4000);
  }

  function renderAdminLayout() {
    body.innerHTML = '<div id="kdChatAdminLayout"><div id="kdChatInbox"><div class="kd-thread">ইনবক্স লোড হচ্ছে…</div></div><div id="kdChatAdminThread"><div id="kdChatStatusLine">একটি কথোপকথন বেছে নিন</div><div id="kdChatMessages"><div id="kdChatEmpty">বাম পাশ থেকে ক্রেতার চ্যাট বেছে নিন।</div></div><div id="kdChatAdminTools"><button id="kdChatCloseThread" type="button">চ্যাট বন্ধ করুন</button><button id="kdChatRefresh" type="button">রিফ্রেশ</button></div><form id="kdChatForm"><input class="kd-file-input" id="kdChatFile" type="file" accept="image/jpeg,image/png,image/webp"><button class="kd-attach" id="kdChatAttach" type="button" aria-label="ছবি পাঠান" title="ছবি পাঠান">📎</button><textarea id="kdChatInput" maxlength="1000" rows="1" placeholder="উত্তর লিখুন…" aria-label="উত্তর লিখুন"></textarea><button id="kdChatSend" type="submit">পাঠান</button></form></div></div>';
    panel.querySelector("#kdChatHeading").childNodes[0].textContent = "লাইভ চ্যাট ইনবক্স";
    panel.querySelector("#kdChatSubtitle").textContent = "ক্রেতার মেসেজের উত্তর দিন";
    wireImagePicker();
    body.querySelector("#kdChatForm").addEventListener("submit", async event => {
      event.preventDefault();
      const input = body.querySelector("#kdChatInput");
      const send = body.querySelector("#kdChatSend");
      if (!activeConversation || !input.value.trim()) return;
      send.disabled = true; showNotice("");
      try {
        await api("admin_send", { conversation_id:activeConversation.id, message:input.value.trim() }, true);
        input.value = ""; await refreshAdminThread(); await refreshAdminInbox();
      } catch (error) { showNotice(error.message); }
      finally { send.disabled = false; input.focus(); }
    });
    body.querySelector("#kdChatCloseThread").addEventListener("click", async () => {
      if (!activeConversation) return;
      try {
        const status = activeConversation.status === "closed" ? "open" : "closed";
        await api("admin_status", { conversation_id:activeConversation.id, status }, true);
        await refreshAdminThread(); await refreshAdminInbox();
      } catch (error) { showNotice(error.message); }
    });
    body.querySelector("#kdChatRefresh").addEventListener("click", () => refreshAdminInbox().then(refreshAdminThread).catch(e=>showNotice(e.message)));
    refreshAdminInbox().catch(error => showNotice(error.message));
    if (inboxTimer) clearInterval(inboxTimer);
    inboxTimer = setInterval(() => refreshAdminInbox().catch(() => {}), 7000);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshAdminThread().catch(() => {}), 4000);
  }
  async function refreshAdminInbox() {
    const data = await api("admin_list", {}, true);
    adminConversations = data.conversations || [];
    const inbox = body.querySelector("#kdChatInbox");
    if (!inbox) return;
    const unreadish = adminConversations.filter(c => c.status === "open").length;
    badge.textContent = unreadish > 99 ? "99+" : String(unreadish);
    badge.style.display = unreadish ? "flex" : "none";
    inbox.replaceChildren();
    if (!adminConversations.length) {
      const empty = document.createElement("div"); empty.className = "kd-thread"; empty.textContent = "এখনো কোনো মেসেজ নেই"; inbox.appendChild(empty); return;
    }
    for (const c of adminConversations) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "kd-thread" + (activeConversation?.id === c.id ? " kd-selected" : "");
      const title = document.createElement("b"); title.textContent = "ক্রেতা #" + c.id.slice(0,6).toUpperCase();
      const preview = document.createElement("small"); preview.textContent = (c.status === "closed" ? "বন্ধ • " : "") + (c.last_message_preview || "নতুন চ্যাট");
      const time = document.createElement("small"); time.textContent = timeLabel(c.last_message_at);
      button.append(title, preview, time);
      button.addEventListener("click", async () => {
        activeConversation = c; lastAdminRender = "";
        await refreshAdminThread();
        await refreshAdminInbox();
      });
      inbox.appendChild(button);
    }
  }
  async function refreshAdminThread() {
    if (!activeConversation) return;
    const data = await api("admin_fetch", { conversation_id:activeConversation.id }, true);
    activeConversation = data.conversation;
    const line = body.querySelector("#kdChatStatusLine");
    if (line) line.textContent = "ক্রেতা #" + activeConversation.id.slice(0,6).toUpperCase() + " • " + (activeConversation.status === "closed" ? "চ্যাট বন্ধ" : "চ্যাট চালু");
    const closeButton = body.querySelector("#kdChatCloseThread");
    if (closeButton) closeButton.textContent = activeConversation.status === "closed" ? "চ্যাট আবার খুলুন" : "চ্যাট বন্ধ করুন";
    const input = body.querySelector("#kdChatInput");
    const send = body.querySelector("#kdChatSend");
    if (input) input.disabled = false;
    if (send) send.disabled = false;
    renderMessages(messagesHost(), data.messages || [], "admin");
  }
  async function initAdminPanel() {
    const { data, error } = await db.auth.getSession();
    if (error || !data.session || data.session.user?.app_metadata?.role !== "admin") {
      body.innerHTML = '<div id="kdChatEmpty">চ্যাট দেখতে অ্যাডমিন হিসেবে লগইন করুন।</div>';
      showNotice("অ্যাডমিন লগইন প্রয়োজন।");
      return;
    }
    adminSession = data.session;
    if (!body.querySelector("#kdChatAdminLayout")) renderAdminLayout();
    try { await refreshAdminInbox(); await refreshAdminThread(); }
    catch (error) { showNotice(error.message); }
    if (inboxTimer) clearInterval(inboxTimer);
    inboxTimer = setInterval(() => refreshAdminInbox().catch(() => {}), 7000);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshAdminThread().catch(() => {}), 4000);
  }
  if (isAdminPage) {
    bubble.style.display = "none";
    db.auth.getSession().then(({data}) => {
      adminSession = data?.session || null;
      if (adminSession?.user?.app_metadata?.role === "admin") bubble.style.display = "flex";
    }).catch(() => {});
    db.auth.onAuthStateChange((_event, session) => {
      adminSession = session || null;
      bubble.style.display = session?.user?.app_metadata?.role === "admin" ? "flex" : "none";
      if (!adminSession && isOpen) { isOpen=false; panel.classList.remove("kd-open"); stopPolling(); }
    });
  }
})();
