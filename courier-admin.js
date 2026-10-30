/* Kine Dekhi courier booking + live tracking controls */
(async function(){
 const root=document.getElementById('ordersList');if(!root)return;
 const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function request(fn,payload){
  const {data}=await db.auth.getSession();if(!data?.session)throw new Error('আবার অ্যাডমিন লগইন করুন।');
  const r=await fetch('https://jyrzdtitmdsxzxtxhecu.supabase.co/functions/v1/'+fn,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+data.session.access_token},body:JSON.stringify(payload)});
  return {status:r.status,ok:r.ok,data:await r.json().catch(()=>({}))};
 }
 const courierName=p=>p==='pathao'?'Pathao Courier':'Steadfast Courier';
 const label=s=>({
  in_review:'কুরিয়ার যাচাই করছে',pending:'কুরিয়ারে অপেক্ষমাণ',delivered_approval_pending:'ডেলিভারি হয়েছে—অনুমোদনের অপেক্ষায়',
  partial_delivered_approval_pending:'আংশিক ডেলিভারি—অনুমোদনের অপেক্ষায়',cancelled_approval_pending:'বাতিলের অনুমোদনের অপেক্ষায়',
  unknown_approval_pending:'অজানা—কুরিয়ার যাচাই প্রয়োজন',delivered:'ডেলিভারি সম্পন্ন',partial_delivered:'আংশিক ডেলিভারি',
  cancelled:'কুরিয়ার বাতিল করেছে',hold:'কুরিয়ারে আটকে আছে',unknown:'কুরিয়ারে অজানা অবস্থা',
  pending_pickup:'পিকআপ অপেক্ষমাণ',picked_up:'কুরিয়ার পিকআপ করেছে',in_transit:'কুরিয়ারে পথে',received_at_hub:'হাবে পৌঁছেছে',
  out_for_delivery:'ডেলিভারির জন্য বের হয়েছে',returned:'রিটার্ন',returned_to_merchant:'মার্চেন্টের কাছে ফেরত'
 }[String(s||'').toLowerCase()]||String(s||'স্ট্যাটাস পাওয়া যায়নি'));
 async function render(){
  const nodes=Array.from(root.querySelectorAll('[id^="order-details-"]'));if(!nodes.length)return;
  let bookings={};
  try{const x=await request('courier-booking',{action:'list'});if(x.ok)(x.data.bookings||[]).forEach(b=>bookings[String(b.order_id)]=b);}catch(e){console.warn('Courier status unavailable',e);}
  nodes.forEach(details=>{
   const orderId=details.id.slice('order-details-'.length);if(!orderId)return;
   const orderStatus=details.querySelector('select[id="status-'+orderId+'"]')?.value;
   if(['delivered','returned','cancelled'].includes(orderStatus)){details.querySelectorAll('[data-courier-ui]').forEach(n=>n.remove());return;}
   const old=details.querySelector('[data-courier-ui]');if(old)old.remove();
   const b=bookings[String(orderId)]||null;
   const panel=document.createElement('section');panel.dataset.courierUi='1';
   panel.style.cssText='margin:12px 0;padding:12px;border:1px solid #b8dcd3;border-radius:10px;background:#f7fffc';
   const history=Array.isArray(b?.status_history)?b.status_history.slice(-4).reverse():[];
   const checked=b?.last_checked_at?new Date(b.last_checked_at).toLocaleString('bn-BD'):'এখনো চেক হয়নি';
   const statusHtml=b?'<div style="margin:7px 0;line-height:1.8"><div><b>'+escapeHtml(courierName(b.provider))+'</b> · '+escapeHtml(b.status==='booked'?'বুকিং সফল':b.status==='failed'?'বুকিং ব্যর্থ':b.status==='unknown'?'অবস্থা নিশ্চিত নয়':'বুকিং চলছে')+'</div><div>কুরিয়ার স্ট্যাটাস: <b>'+escapeHtml(label(b.courier_status||b.status))+'</b></div>'+(b.courier_status_message?'<div style="color:#475569">'+escapeHtml(b.courier_status_message)+'</div>':'')+(b.consignment_id?'<div>Consignment ID: '+escapeHtml(b.consignment_id)+'</div>':'')+(b.tracking_code?'<div>Tracking: '+escapeHtml(b.tracking_code)+'</div>':'')+(b.tracking_url?'<div><a target="_blank" rel="noopener" href="'+escapeHtml(b.tracking_url)+'">কুরিয়ার ট্র্যাকিং খুলুন</a></div>':'')+'<small style="color:#64748b">সর্বশেষ চেক: '+escapeHtml(checked)+'</small>'+(history.length?'<div style="margin-top:6px;font-size:12px;color:#475569"><b>সাম্প্রতিক ইতিহাস</b>'+history.map(h=>'<div>• '+escapeHtml(label(h.status||h.label))+' — '+escapeHtml(h.checked_at?new Date(h.checked_at).toLocaleString('bn-BD'):'')+'</div>').join('')+'</div>':'')+'</div>':'<div class="courier-result" style="margin:6px 0">এখনো কুরিয়ার বুকিং করা হয়নি।</div>';
   panel.innerHTML='<b>🚚 কুরিয়ার বুকিং ও লাইভ স্ট্যাটাস</b>'+statusHtml+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" class="courier-refresh" '+(b?.status==='booked'?'':'disabled')+'>↻ স্ট্যাটাস রিফ্রেশ</button></div>'+
    '<label>কুরিয়ার নির্বাচন</label><select class="courier-provider"><option value="pathao" '+(b?.provider==='pathao'?'selected':'')+'>Pathao Courier</option><option value="steadfast" '+(b?.provider==='steadfast'?'selected':'')+'>Steadfast Courier</option></select>'+
    '<div class="courier-pathao-fields"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"><div><label>Pathao City ID</label><input class="courier-city" type="number" min="1" placeholder="City ID"></div><div><label>Pathao Zone ID</label><input class="courier-zone" type="number" min="1" placeholder="Zone ID"></div></div><label>Pathao Area ID (ঐচ্ছিক)</label><input class="courier-area" type="number" min="1" placeholder="Area ID"></div>'+
    '<div class="courier-steadfast-note" style="display:none;padding:8px;margin:8px 0;background:#fff;border-radius:7px">Steadfast-এর জন্য City ID/Zone ID প্রয়োজন নেই। বুকিংয়ের আগে অর্ডারের ঠিকানা যাচাই করুন।</div>'+
    '<button type="button" class="courier-book" '+(b&&['pending','booked','unknown'].includes(b.status)?'disabled':'')+'>কুরিয়ার বুক করুন</button>'+
    (b?.error_message?'<div style="margin-top:6px;color:#b91c1c">'+escapeHtml(b.error_message)+'</div>':'');
   const provider=panel.querySelector('.courier-provider'),pathao=panel.querySelector('.courier-pathao-fields'),steadfast=panel.querySelector('.courier-steadfast-note');
   const sync=()=>{const yes=provider.value==='pathao';pathao.style.display=yes?'block':'none';steadfast.style.display=yes?'none':'block';};provider.addEventListener('change',sync);sync();
   panel.querySelector('.courier-refresh').addEventListener('click',async()=>{
    const btn=panel.querySelector('.courier-refresh');btn.disabled=true;btn.textContent='চেক হচ্ছে…';
    try{const x=await request('courier-tracking',{action:'sync',order_id:Number(orderId)});if(!x.ok)throw new Error(x.data.error||'স্ট্যাটাস পাওয়া যায়নি');await render();}
    catch(e){btn.disabled=false;btn.textContent='↻ আবার চেষ্টা করুন';alert('কুরিয়ার স্ট্যাটাস আপডেট হয়নি: '+(e.message||'ত্রুটি'));}
   });
   panel.querySelector('.courier-book').addEventListener('click',async()=>{
    const p=provider.value,payload={action:'book',order_id:Number(orderId),provider:p},result=panel.querySelector('.courier-result');
    if(p==='pathao'){payload.city_id=Number(panel.querySelector('.courier-city').value);payload.zone_id=Number(panel.querySelector('.courier-zone').value);payload.area_id=panel.querySelector('.courier-area').value?Number(panel.querySelector('.courier-area').value):null;if(!payload.city_id||!payload.zone_id){alert('Pathao City ID ও Zone ID দিন।');return;}}
    if(!confirm((p==='pathao'?'Pathao':'Steadfast')+'-এ এই অর্ডারের পার্সেল বুক করবেন?'))return;
    const btn=panel.querySelector('.courier-book');btn.disabled=true;provider.disabled=true;if(result)result.textContent='বুকিং অনুরোধ পাঠানো হচ্ছে…';
    try{const x=await request('courier-booking',payload);if(x.ok&&x.data.success){await render();return;}if(result)result.textContent=x.data.error||'বুকিং নিশ্চিত হয়নি।';if(x.status===202&&result)result.textContent+=' আবার বুক করবেন না; কুরিয়ার পোর্টালে যাচাই করুন।';btn.disabled=false;provider.disabled=false;}
    catch(e){if(result)result.textContent='ত্রুটি: '+(e.message||'নেটওয়ার্ক সমস্যা')+'. পোর্টালে যাচাই না করে আবার বুক করবেন না।';btn.disabled=false;provider.disabled=false;}
   });
   const statusLabel=details.querySelector('label[for="status-'+orderId+'"]');if(statusLabel)details.insertBefore(panel,statusLabel);else details.appendChild(panel);
  });
 }
 let busy=false;const run=async()=>{if(busy)return;busy=true;try{await render()}finally{busy=false;}};
 new MutationObserver(()=>{if(root.querySelector('[id^="order-details-"]'))run();}).observe(root,{childList:true,subtree:true});
 setTimeout(run,1200);
})();