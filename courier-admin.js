/* Kine Dekhi manual courier booking UI. Loaded by admin.html after the admin app. */
(async function(){
 const root=document.getElementById('ordersList');if(!root)return;
 const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function call(payload){
  const {data}=await db.auth.getSession();if(!data?.session)throw new Error('আবার অ্যাডমিন লগইন করুন।');
  const r=await fetch('https://jyrzdtitmdsxzxtxhecu.supabase.co/functions/v1/courier-booking',{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+data.session.access_token},body:JSON.stringify(payload)});
  return {status:r.status,ok:r.ok,data:await r.json().catch(()=>({}))};
 }
 async function render(){
  if(!Array.isArray(adminOrdersCache))return;
  let bookings={};
  try{const x=await call({action:'list'});if(x.ok)(x.data.bookings||[]).forEach(b=>bookings[String(b.order_id)]=b);}catch(e){console.warn('Courier status unavailable',e);}
  adminOrdersCache.forEach(o=>{
   const details=document.getElementById('order-details-'+o.id);if(!details||details.querySelector('[data-courier-ui]'))return;
   const b=bookings[String(o.id)]||null,locked=b&&['pending','booked','unknown'].includes(b.status);
   const status={pending:'বুকিং চলছে',booked:'বুকিং সফল',failed:'বুকিং ব্যর্থ',unknown:'অবস্থা নিশ্চিত নয় — কুরিয়ার পোর্টালে যাচাই করুন'};
   const panel=document.createElement('section');panel.dataset.courierUi='1';panel.style.cssText='margin:12px 0;padding:12px;border:1px solid #b8dcd3;border-radius:10px;background:#f7fffc';
   panel.innerHTML='<b>🚚 কুরিয়ার বুকিং</b><div class="courier-result" style="margin:6px 0">'+(b?escapeHtml(b.provider==='pathao'?'Pathao Courier':'Steadfast Courier')+' · '+escapeHtml(status[b.status]||b.status)+(b.consignment_id?'<div>Consignment ID: <b>'+escapeHtml(b.consignment_id)+'</b></div>':'')+(b.tracking_code?'<div>Tracking: <b>'+escapeHtml(b.tracking_code)+'</b></div>':'')+(b.tracking_url?'<div><a target="_blank" rel="noopener" href="'+escapeHtml(b.tracking_url)+'">ট্র্যাকিং খুলুন</a></div>':'')+(b.error_message?'<div>'+escapeHtml(b.error_message)+'</div>':''):'এখনো বুকিং করা হয়নি।')+'</div><label>কুরিয়ার</label><select class="courier-provider" '+(locked?'disabled':'')+'><option value="pathao" '+(b?.provider==='pathao'?'selected':'')+'>Pathao Courier</option><option value="steadfast" '+(b?.provider==='steadfast'?'selected':'')+'>Steadfast Courier</option></select><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"><div><label>Pathao City ID</label><input class="courier-city" type="number" min="1" placeholder="City ID" '+(locked?'disabled':'')+'></div><div><label>Pathao Zone ID</label><input class="courier-zone" type="number" min="1" placeholder="Zone ID" '+(locked?'disabled':'')+'></div></div><label>Pathao Area ID (ঐচ্ছিক)</label><input class="courier-area" type="number" min="1" placeholder="Area ID" '+(locked?'disabled':'')+'><button type="button" class="courier-book" '+(locked?'disabled':'')+'>কুরিয়ার বুক করুন</button>';
   panel.querySelector('.courier-book').addEventListener('click',async()=>{
    const provider=panel.querySelector('.courier-provider').value,result=panel.querySelector('.courier-result'),payload={action:'book',order_id:o.id,provider};
    if(provider==='pathao'){payload.city_id=Number(panel.querySelector('.courier-city').value);payload.zone_id=Number(panel.querySelector('.courier-zone').value);payload.area_id=panel.querySelector('.courier-area').value?Number(panel.querySelector('.courier-area').value):null;if(!payload.city_id||!payload.zone_id){result.textContent='Pathao City ID ও Zone ID সঠিকভাবে দিন।';return;}}
    if(!confirm((provider==='pathao'?'Pathao':'Steadfast')+'-এ এই অর্ডারের বাস্তব পার্সেল বুক করবেন?'))return;
    const button=panel.querySelector('.courier-book');button.disabled=true;result.textContent='বুকিং অনুরোধ পাঠানো হচ্ছে…';
    try{const x=await call(payload);if(x.ok&&x.data.success){result.textContent='বুকিং সফল। '+(x.data.booking.consignment_id?'Consignment ID: '+x.data.booking.consignment_id:'')+(x.data.booking.tracking_code?' · Tracking: '+x.data.booking.tracking_code:'');await render();return;}result.textContent=x.data.error||'বুকিং নিশ্চিত হয়নি।';if(x.status===202)result.textContent+=' আবার বুক করবেন না; কুরিয়ার পোর্টালে যাচাই করুন।';button.disabled=false;}
    catch(e){result.textContent='ত্রুটি: '+(e.message||'নেটওয়ার্ক সমস্যা')+'. পোর্টালে যাচাই না করে আবার বুক করবেন না।';button.disabled=false;}
   });
   details.prepend(panel);
  });
 }
 let busy=false;
 const run=async()=>{if(busy)return;busy=true;try{await render()}finally{busy=false}};
 new MutationObserver(()=>{if(root.querySelector('[id^="order-details-"]'))run()}).observe(root,{childList:true,subtree:true});
 setTimeout(run,1200);
})();
