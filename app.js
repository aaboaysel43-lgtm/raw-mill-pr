/* Raw Mill PR - browser client */
(() => {
  const cfg = window.RAW_MILL_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const state = { supabase:null, user:null, parts:[], movements:[], requests:[], requestItems:[], filteredParts:[], page:0, pageSize:100, currentRequest:null };
  const statuses = ["Pending","Approved","Rejected","Ordered","Partially Received","Received","Cancelled"];
  const fmtDate = (v) => v ? new Date(v).toLocaleDateString("en-GB") : "";
  const fmtDateTime = (v) => v ? new Date(v).toLocaleString("en-GB") : "";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let toastTimer;
  function toast(msg, error=false){ const el=$("toast"); el.textContent=msg; el.className="toast show"+(error?" error":""); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.className="toast",3500); }
  function message(id,msg,kind=""){ const el=$(id); el.textContent=msg; el.className="form-message "+kind; }
  function showLogin(){ $("loginPanel").classList.remove("hidden"); $("appPanel").classList.add("hidden"); $("logoutBtn").classList.add("hidden"); }
  function showApp(){ $("loginPanel").classList.add("hidden"); $("appPanel").classList.remove("hidden"); $("logoutBtn").classList.remove("hidden"); }
  function csvDownload(filename, rows, columns){
    const csv = [columns.map(c=>c.label), ...rows.map(r=>columns.map(c=>r[c.key] ?? ""))]
      .map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob = new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
  }
  function printNow(){ window.print(); }
  function statusClass(s){return "status-pill "+String(s||"").replace(/\s/g,"");}
  function partLabel(p){return `${p.sap_code || "بدون SAP"} — ${p.description || ""}`.slice(0,180);}
  function currentPart(id){return state.parts.find(p=>String(p.id)===String(id));}
  async function ensureConfig(){
    if(!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("PASTE_")){
      $("configWarning").classList.remove("hidden");
      $("configWarning").innerHTML="إعداد الاتصال غير مكتمل. افتح <b>config.js</b> وضع Supabase Project URL و anon/public key. لا تستخدم service_role key.";
      $("connectionBadge").textContent="الإعداد غير مكتمل"; $("connectionBadge").className="badge warn";
      return false;
    }
    state.supabase=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    $("configWarning").classList.add("hidden");
    $("connectionBadge").textContent="جاهز للاتصال"; $("connectionBadge").className="badge good";
    return true;
  }
  async function loadAll(){
    if(!state.supabase) return;
    const [parts,moves,reqs,items] = await Promise.all([
      state.supabase.from("spare_parts").select("*").order("sap_code",{ascending:true}).limit(10000),
      state.supabase.from("stock_movements").select("*, spare_parts(sap_code,description)").order("created_at",{ascending:false}).limit(1000),
      state.supabase.from("pr_requests").select("*").order("created_at",{ascending:false}).limit(1000),
      state.supabase.from("pr_request_items").select("*, spare_parts(sap_code,description)").limit(5000)
    ]);
    for (const r of [parts,moves,reqs,items]) if(r.error) throw r.error;
    state.parts=parts.data||[]; state.movements=moves.data||[]; state.requests=reqs.data||[]; state.requestItems=items.data||[];
    state.filteredParts=state.parts.slice(); renderParts(); renderMovements(); renderRequests(); fillPartSelects(); updateStats();
  }
  function updateStats(){
    $("partsCount").textContent=state.parts.length.toLocaleString("en-US");
    $("lowStockCount").textContent=state.parts.filter(p=>Number(p.min_stock)>0 && Number(p.stock_on_hand)<=Number(p.min_stock)).length.toLocaleString("en-US");
    $("requestsCount").textContent=state.requests.length.toLocaleString("en-US");
  }
  function renderParts(){
    const q=$("partsSearch").value.trim().toLowerCase();
    state.filteredParts=state.parts.filter(p=>[p.sap_code,p.old_code,p.description,p.bin_location,p.original_fifth_column].some(v=>String(v||"").toLowerCase().includes(q)));
    const start=state.page*state.pageSize, list=state.filteredParts.slice(start,start+state.pageSize);
    $("partsTbody").innerHTML=list.length?list.map(p=>{
      const low=Number(p.min_stock)>0 && Number(p.stock_on_hand)<=Number(p.min_stock);
      return `<tr class="${low?'low-stock':''}"><td><b>${esc(p.sap_code)}</b></td><td>${esc(p.old_code)}</td><td>${esc(p.description)}</td><td>${esc(p.bin_location)}</td><td>${esc(p.unit)}</td><td>${Number(p.stock_on_hand||0).toLocaleString("en-US")}</td><td>${Number(p.min_stock||0).toLocaleString("en-US")}</td><td><div class="action-group"><button class="mini-btn" data-edit-part="${p.id}">تعديل</button><button class="mini-btn" data-move-part="${p.id}">حركة</button></div></td></tr>`;
    }).join(""):`<tr><td colspan="8" class="empty">لا توجد نتائج مطابقة.</td></tr>`;
    const pages=Math.max(1,Math.ceil(state.filteredParts.length/state.pageSize));
    $("partsPager").innerHTML=`<span>${state.filteredParts.length.toLocaleString("en-US")} نتيجة</span><span><button class="mini-btn" id="prevPage" ${state.page===0?'disabled':''}>السابق</button> صفحة ${state.page+1} من ${pages} <button class="mini-btn" id="nextPage" ${state.page+1>=pages?'disabled':''}>التالي</button></span>`;
    $("prevPage")?.addEventListener("click",()=>{state.page--;renderParts();});
    $("nextPage")?.addEventListener("click",()=>{state.page++;renderParts();});
  }
  function fillPartSelects(){
    const opts=state.parts.map(p=>`<option value="${p.id}">${esc(partLabel(p))}</option>`).join("");
    $("movementPart").innerHTML=opts||'<option value="">لا توجد قطع</option>';
  }
  function renderMovements(){
    $("movementsTbody").innerHTML=state.movements.length?state.movements.map(m=>`<tr><td>${fmtDateTime(m.created_at)}</td><td>${esc(m.spare_parts?.sap_code)}</td><td>${esc(m.spare_parts?.description)}</td><td>${esc(({RECEIPT:"استلام",ISSUE:"صرف",ADJUSTMENT:"تسوية"})[m.movement_type]||m.movement_type)}</td><td>${Number(m.quantity).toLocaleString("en-US")}</td><td>${esc(m.reference_no)}</td><td>${esc(m.created_by||"")}</td></tr>`).join(""):'<tr><td colspan="7" class="empty">لا توجد حركات مسجلة.</td></tr>';
  }
  function renderRequests(){
    const q=$("requestSearch").value.trim().toLowerCase(), status=$("requestStatusFilter").value;
    const list=state.requests.filter(r=>(!status||r.status===status)&&[r.pr_number,r.department,r.purpose,r.notes].some(v=>String(v||"").toLowerCase().includes(q)));
    $("requestsTbody").innerHTML=list.length?list.map(r=>{
      const count=state.requestItems.filter(i=>String(i.request_id)===String(r.id)).length;
      return `<tr><td><b>${esc(r.pr_number||("PR-"+r.id))}</b></td><td>${fmtDate(r.request_date)}</td><td>${esc(r.department)}</td><td>${esc(r.purpose)}</td><td><span class="${statusClass(r.status)}">${esc(r.status)}</span></td><td>${count}</td><td><div class="action-group"><button class="mini-btn" data-detail-request="${r.id}">تفاصيل</button><select class="status-select" data-status-request="${r.id}">${statuses.map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join("")}</select></div></td></tr>`;
    }).join(""):'<tr><td colspan="7" class="empty">لا توجد طلبات مطابقة.</td></tr>';
  }
  function openPartDialog(part=null){
    $("partForm").reset(); $("partId").value=part?.id||"";
    $("partDialogTitle").textContent=part?"تعديل قطعة غيار":"إضافة قطعة غيار";
    $("partSap").value=part?.sap_code||""; $("partOld").value=part?.old_code||"";
    $("partDescription").value=part?.description||""; $("partBin").value=part?.bin_location||"";
    $("partUnit").value=part?.unit||""; $("partStock").value=part?.stock_on_hand??0;
    $("partMin").value=part?.min_stock??0; $("partFifth").value=part?.original_fifth_column||"";
    message("partMessage","");
    $("partDialog").showModal();
  }
  async function savePart(e){
    e.preventDefault(); const id=$("partId").value;
    const payload={sap_code:$("partSap").value.trim()||null,old_code:$("partOld").value.trim()||null,description:$("partDescription").value.trim(),bin_location:$("partBin").value.trim()||null,unit:$("partUnit").value.trim()||null,original_fifth_column:$("partFifth").value.trim()||null,min_stock:Number($("partMin").value||0),updated_at:new Date().toISOString()};
    try{
      if(id){
        // الرصيد لا يُعدّل من شاشة بيانات القطعة لتجنب كسر سجل الحركات.
        const {error}=await state.supabase.from("spare_parts").update(payload).eq("id",id); if(error)throw error;
      }else{
        payload.stock_on_hand=0;
        const {error}=await state.supabase.from("spare_parts").insert(payload); if(error)throw error;
      }
      $("partDialog").close(); await loadAll(); toast(id?"تم تحديث القطعة":"تمت إضافة القطعة. الرصيد يبدأ من صفر؛ سجّل تسوية أو استلامًا لتغييره.");
    }catch(err){message("partMessage",err.message,"error");}
  }
  async function saveMovement(e){
    e.preventDefault(); message("movementMessage","جارٍ الحفظ...");
    const part=currentPart($("movementPart").value), type=$("movementType").value, qty=Number($("movementQty").value);
    if(!part||!Number.isFinite(qty)||qty<=0){message("movementMessage","اختر قطعة وكمية صحيحة.","error");return;}
    if(type==="ISSUE" && Number(part.stock_on_hand)<qty){message("movementMessage","الرصيد الحالي لا يكفي للصرف.","error");return;}
    const delta=type==="RECEIPT"?qty:type==="ISSUE"?-qty:null;
    try{
      const {error}=await state.supabase.from("stock_movements").insert({part_id:part.id,movement_type:type,quantity:qty,reference_no:$("movementRef").value.trim()||null,notes:$("movementNotes").value.trim()||null,created_by:state.user.id});
      if(error)throw error;
      if(delta!==null){
        const {error:upErr}=await state.supabase.from("spare_parts").update({stock_on_hand:Number(part.stock_on_hand)+delta,updated_at:new Date().toISOString()}).eq("id",part.id);
        if(upErr)throw upErr;
      }else{
        const newBalance=prompt(`الرصيد الحالي ${part.stock_on_hand}. اكتب الرصيد الفعلي الجديد للتسوية:`,String(part.stock_on_hand));
        if(newBalance===null){toast("تم تسجيل الحركة دون تغيير الرصيد. يلزم مراجعة الحركة.");}
        else {const n=Number(newBalance);if(!Number.isFinite(n)||n<0)throw new Error("الرصيد الجديد غير صالح.");const {error:upErr}=await state.supabase.from("spare_parts").update({stock_on_hand:n,updated_at:new Date().toISOString()}).eq("id",part.id);if(upErr)throw upErr;}
      }
      $("movementForm").reset(); await loadAll(); message("movementMessage","تم حفظ الحركة.","success"); toast("تم تسجيل حركة المخزون.");
    }catch(err){message("movementMessage",err.message,"error");}
  }
  function addPrLine(partId="",qty="1",unit=""){
    const row=document.createElement("div"); row.className="pr-line";
    row.innerHTML=`<label>قطعة الغيار<select class="pr-part" required><option value="">اختر قطعة</option>${state.parts.map(p=>`<option value="${p.id}" ${String(p.id)===String(partId)?'selected':''}>${esc(partLabel(p))}</option>`).join("")}</select></label><label>الكمية<input class="pr-qty" type="number" min="0.001" step="0.001" value="${esc(qty)}" required></label><label>الوحدة<input class="pr-unit" value="${esc(unit)}" maxlength="40"></label><button type="button" class="remove-line">حذف</button>`;
    row.querySelector(".pr-part").addEventListener("change",e=>{const p=currentPart(e.target.value);row.querySelector(".pr-unit").value=p?.unit||"";});
    row.querySelector(".remove-line").addEventListener("click",()=>row.remove());
    $("prLines").appendChild(row);
  }
  function openRequestDialog(){ $("requestForm").reset(); $("prLines").innerHTML=""; addPrLine(); message("requestMessage",""); $("requestDialog").showModal(); }
  async function saveRequest(e){
    e.preventDefault(); const lines=[...$("prLines").querySelectorAll(".pr-line")].map(r=>({part_id:Number(r.querySelector(".pr-part").value),quantity:Number(r.querySelector(".pr-qty").value),unit:r.querySelector(".pr-unit").value.trim()||null})).filter(x=>x.part_id&&x.quantity>0);
    if(!lines.length){message("requestMessage","أضف بندًا واحدًا على الأقل.","error");return;}
    try{
      const prNum=$("prNumber").value.trim()||`RMP-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const payload={pr_number:prNum,requested_by:state.user.id,department:$("prDepartment").value.trim()||null,purpose:$("prPurpose").value.trim(),status:$("prStatus").value,notes:$("prNotes").value.trim()||null};
      const {data,error}=await state.supabase.from("pr_requests").insert(payload).select().single(); if(error)throw error;
      const items=lines.map(l=>({request_id:data.id,part_id:l.part_id,quantity:l.quantity,unit:l.unit,description:currentPart(l.part_id)?.description||""}));
      const {error:lineError}=await state.supabase.from("pr_request_items").insert(items); if(lineError){await state.supabase.from("pr_requests").delete().eq("id",data.id);throw lineError;}
      $("requestDialog").close(); await loadAll(); toast("تم حفظ طلب PR.");
    }catch(err){message("requestMessage",err.message,"error");}
  }
  async function showRequestDetail(id){
    const r=state.requests.find(x=>String(x.id)===String(id)); if(!r)return;
    const items=state.requestItems.filter(i=>String(i.request_id)===String(id));
    $("requestDetailTitle").textContent=`طلب ${r.pr_number||("PR-"+r.id)}`;
    $("requestDetailBody").innerHTML=`<div class="form-grid two"><div><b>التاريخ:</b> ${fmtDate(r.request_date)}</div><div><b>الحالة:</b> ${esc(r.status)}</div><div><b>القسم:</b> ${esc(r.department)}</div><div><b>الغرض:</b> ${esc(r.purpose)}</div></div><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>SAP</th><th>الوصف</th><th>الكمية</th><th>الوحدة</th><th>المستلم</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.spare_parts?.sap_code||"")}</td><td>${esc(i.description||i.spare_parts?.description||"")}</td><td>${Number(i.quantity)}</td><td>${esc(i.unit)}</td><td>${Number(i.received_quantity||0)}</td></tr>`).join("")}</tbody></table></div><p>${esc(r.notes||"")}</p>`;
    state.currentRequest=r; $("requestDetailDialog").showModal();
  }
  async function updateRequestStatus(id,status){
    try{const {error}=await state.supabase.from("pr_requests").update({status,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;await loadAll();toast("تم تحديث حالة الطلب.");}
    catch(err){toast(err.message,true);await loadAll();}
  }
  function exportParts(){csvDownload("raw_mill_spare_parts.csv",state.parts,[{key:"sap_code",label:"SAP Code"},{key:"old_code",label:"Old Code"},{key:"description",label:"Description"},{key:"bin_location",label:"Bin"},{key:"unit",label:"Unit"},{key:"stock_on_hand",label:"Stock"},{key:"min_stock",label:"Minimum Stock"},{key:"original_fifth_column",label:"Original Fifth Column"}]);}
  function exportMovements(){csvDownload("raw_mill_stock_movements.csv",state.movements.map(m=>({...m,sap_code:m.spare_parts?.sap_code,description:m.spare_parts?.description})),[{key:"created_at",label:"Date"},{key:"sap_code",label:"SAP Code"},{key:"description",label:"Description"},{key:"movement_type",label:"Type"},{key:"quantity",label:"Quantity"},{key:"reference_no",label:"Reference"},{key:"notes",label:"Notes"},{key:"created_by",label:"User ID"}]);}
  function exportRequests(){csvDownload("raw_mill_pr_requests.csv",state.requests.map(r=>({...r,item_count:state.requestItems.filter(i=>String(i.request_id)===String(r.id)).length})),[{key:"pr_number",label:"PR Number"},{key:"request_date",label:"Date"},{key:"department",label:"Department"},{key:"purpose",label:"Purpose"},{key:"status",label:"Status"},{key:"item_count",label:"Items"},{key:"notes",label:"Notes"}]);}
  function switchView(viewId){
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.view===viewId));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active-view",v.id===viewId));
  }
  async function boot(){
    if(!(await ensureConfig())){showLogin();return;}
    const {data:{session},error}=await state.supabase.auth.getSession(); if(error)console.error(error);
    if(session){state.user=session.user;showApp();try{await loadAll();}catch(e){toast(e.message,true);}}
    else showLogin();
    state.supabase.auth.onAuthStateChange(async(_event,session)=>{
      state.user=session?.user||null;
      if(session){showApp();try{await loadAll();}catch(e){toast(e.message,true);}}
      else showLogin();
    });
  }
  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();message("loginMessage","جارٍ تسجيل الدخول...");
    if(!state.supabase){message("loginMessage","أكمل إعداد config.js أولًا.","error");return;}
    const {error}=await state.supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
    if(error)message("loginMessage",error.message,"error");else message("loginMessage","تم تسجيل الدخول.","success");
  });
  $("logoutBtn").addEventListener("click",async()=>{await state.supabase.auth.signOut();});
  document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>switchView(t.dataset.view)));
  $("addPartBtn").addEventListener("click",()=>openPartDialog());
  $("partForm").addEventListener("submit",savePart);
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
  $("partsTbody").addEventListener("click",e=>{
    const edit=e.target.closest("[data-edit-part]"), move=e.target.closest("[data-move-part]");
    if(edit)openPartDialog(currentPart(edit.dataset.editPart));
    if(move){switchView("stockView");$("movementPart").value=move.dataset.movePart;$("movementType").focus();}
  });
  $("partsSearch").addEventListener("input",()=>{state.page=0;renderParts();});
  $("refreshPartsBtn").addEventListener("click",async()=>{try{await loadAll();toast("تم تحديث البيانات.");}catch(e){toast(e.message,true);}});
  $("movementForm").addEventListener("submit",saveMovement);
  $("newRequestBtn").addEventListener("click",openRequestDialog);
  $("addPrLineBtn").addEventListener("click",()=>addPrLine());
  $("requestForm").addEventListener("submit",saveRequest);
  $("requestsTbody").addEventListener("click",e=>{const b=e.target.closest("[data-detail-request]");if(b)showRequestDetail(b.dataset.detailRequest);});
  $("requestsTbody").addEventListener("change",e=>{const s=e.target.closest("[data-status-request]");if(s)updateRequestStatus(s.dataset.statusRequest,s.value);});
  $("requestSearch").addEventListener("input",renderRequests);$("requestStatusFilter").addEventListener("change",renderRequests);
  $("exportPartsBtn").addEventListener("click",exportParts);$("reportPartsBtn").addEventListener("click",exportParts);
  $("exportMovementsBtn").addEventListener("click",exportMovements);$("reportStockBtn").addEventListener("click",exportMovements);
  $("exportRequestsBtn").addEventListener("click",exportRequests);$("reportPRBtn").addEventListener("click",exportRequests);
  ["printPartsBtn","printMovementsBtn","printRequestsBtn","printCurrentBtn"].forEach(id=>$(id).addEventListener("click",printNow));
  $("printRequestDetailBtn").addEventListener("click",printNow);
  $("partDialog").addEventListener("click",e=>{if(e.target===$("partDialog"))$("partDialog").close();});
  boot();
})();
