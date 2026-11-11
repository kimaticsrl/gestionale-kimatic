// @ts-nocheck
// Modulo Kimatic Troubleshooting: interfaccia portata dalla versione su claude.ai.
// Dati e foto passano da Supabase (vedi dati.js). Import da email e traduzione automatica
// richiedono Claude e per ora non sono attivi.
export function avvia(ROOT, CTX) {
const $ = id => ROOT.querySelector("#"+id);
const S = { urls:{}, me:CTX.me, gestisce:CTX.gestisce, assets:null, formFoto:[], uploading:0, db:null, sample:null, canWrite:true, casi:[], liste:{macchine:[],argomenti:[]}, open:new Set(), editId:null, queue:[], qi:0, impCtl:null, archMac:"", archArg:"" };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = (msg) => { const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast.h); toast.h=setTimeout(()=>t.hidden=true,2600); };
const today = () => new Date().toISOString().slice(0,10);
const fmtDate = d => { if(!d) return ""; const [y,m,g]=d.split("-"); return g?`${g}/${m}/${y}`:d; };

/* ---------- testo & ricerca ---------- */
const STOP = new Set("il lo la i gli le un uno una di da in con su per tra fra che non se del della dei delle degli dello al allo alla ai agli alle dal dalla dai dalle nel nella nei nelle sul sulla sui come quando dopo prima poi anche piu molto sono era viene fatto fa ha hanno ho abbiamo questo questa quello quella essere stato stata cliente problema dice detto ogni sempre volte volta mentre the and".split(" "));
const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const toks = s => norm(s).split(/[^a-z0-9]+/).filter(t => t.length>=3 && !STOP.has(t));
const stem = t => (/\d/.test(t) || t.length<=5) ? t : t.slice(0, t.length-2);
const compact = s => norm(s).replace(/[^a-z0-9]/g,"");
const FIELDS = [["titolo",3],["parole",3],["codice",3],["sintomi",2.5],["causa",1.5],["soluzione",1],["argomento",1],["macchina",1]];
function index(c){ c._i = {}; for (const [f] of FIELDS) c._i[f] = toks(c[f]).map(stem); c._code = compact(c.codice); }
function hit(qs, arr){ return arr.some(t => t.startsWith(qs) || (t.length>=4 && qs.startsWith(t))); }
function score(c, qStems, qCompact){
  let s=0; const matched=[];
  for (const q of qStems){
    let best=0; for (const [f,w] of FIELDS) if (w>best && hit(q, c._i[f])) best=w;
    if (best){ s+=best; matched.push(q); }
  }
  if (c._code && c._code.length>=2 && qCompact.includes(c._code)) { s+=8; matched.unshift(c.codice); }
  const max = Math.max(1, qStems.length*3);
  return { s, pct: Math.min(100, Math.round(s/max*100)), matched };
}
function search(){
  const mac=$("qMac").value, arg=$("qArg").value, q=$("q").value.trim();
  const qStems=[...new Set(toks(q).map(stem))], qc=compact(q);
  const pool = S.casi.filter(c => (!arg || c.argomento===arg));
  const run = list => list.map(c => ({c, ...score(c,qStems,qc)})).filter(r => r.s>0).sort((a,b)=>b.s-a.s || (b.c.data||"").localeCompare(a.c.data||""));
  const box=$("results");
  if (!S.casi.length){ $("qInfo").textContent = S.db ? "L'archivio è vuoto: registra il primo caso dalla scheda Nuovo caso." : $("qInfo").textContent; box.innerHTML=""; return; }
  if (!q){
    const list = pool.filter(c => !mac || c.macchina===mac).sort((a,b)=>(b.data||"").localeCompare(a.data||""));
    $("qInfo").textContent = `${S.casi.length} casi in archivio · ${list.length} con questi filtri. Scrivi il sintomo per ordinarli per somiglianza.`;
    box.innerHTML = list.slice(0,30).map(c => card(c)).join("") || `<div class="empty">Nessun caso per questa combinazione.</div>`;
    return;
  }
  const same = run(pool.filter(c => !mac || c.macchina===mac)).slice(0,15);
  let html = same.map(r => card(r.c, r)).join("");
  if (mac){
    const other = run(pool.filter(c => c.macchina!==mac)).slice(0,5);
    if (other.length) html += `<div class="sec-t"><h2>Casi simili su altre macchine</h2><span class="meta">potrebbero valere anche per ${esc(mac)}</span></div>` + other.map(r => card(r.c, r)).join("");
  }
  $("qInfo").textContent = same.length ? `${same.length} casi trovati${mac?" su "+mac:""}, dal più simile` : `Nessun caso simile${mac?" su "+mac:""}.`;
  box.innerHTML = html || `<div class="empty">Nessun caso simile in archivio. Quando l'avrai risolto, registralo dalla scheda <b>Nuovo caso</b>.</div>`;
}

/* ---------- card caso ---------- */
function card(c, r){
  const open = S.open.has(c.id);
  const lbl = r ? (r.pct>=70?"Molto simile":r.pct>=40?"Simile":"Possibile") : "";
  return `<article class="case" data-id="${esc(c.id)}">
    <div class="case-h" data-act="toggle" tabindex="0" role="button" aria-expanded="${open}">
      <div class="case-t"><h3>${esc(c.titolo||"(senza titolo)")}</h3>
        <div class="tags"><span class="tag m">${esc(c.macchina)}</span><span class="tag">${esc(c.argomento)}</span>${c.codice?`<span class="tag code">${esc(c.codice)}</span>`:""}${c.data?`<span class="tag">${fmtDate(c.data)}</span>`:""}${c.esempio?`<span class="tag ex">esempio</span>`:""}</div>
      </div>
      ${r?`<div class="match"><small>${lbl}</small><div class="meter"><i style="width:${r.pct}%"></i></div></div>`:""}
    </div>
    ${open?`<div class="case-b">
      ${r&&r.matched.length?`<div class="found">Corrisponde a: ${r.matched.map(m=>`<b>${esc(m)}</b>`).join(" · ")}</div>`:""}
      <dl>
        <dt>Sintomi</dt><dd>${esc(c.sintomi)}</dd>
        ${c.causa?`<dt>Causa</dt><dd>${esc(c.causa)}</dd>`:""}
        <dt>Soluzione</dt><dd><div class="sol">${esc(c.soluzione)}</div></dd>
        ${(c.foto||[]).length?`<dt>Foto</dt><dd><div class="gallery">${c.foto.map(f=>thumb(f,false)).join("")}</div></dd>`:""}
        ${c.parole?`<dt>Parole chiave</dt><dd>${esc(c.parole)}</dd>`:""}
        ${(c.cliente||c.tecnico||c.fonte)?`<dt>Origine</dt><dd>${[c.cliente&&("Cliente: "+esc(c.cliente)), c.tecnico&&("Tecnico: "+esc(c.tecnico)), c.fonte&&esc(c.fonte)].filter(Boolean).join(" · ")}</dd>`:""}
      </dl>
      <div class="row">
        <button class="btn primary" data-act="copy">Copia soluzione per il cliente</button>
        <button class="btn" data-act="copyEn" title="Copy the solution for the customer in English">Copia in inglese</button>
        <span class="spacer"></span>
        ${S.canWrite?`<button class="btn" data-act="edit">Modifica</button>`:""}${(S.gestisce||(S.canWrite&&c._by===S.me))?`<button class="btn danger" data-act="del">Elimina</button>`:""}
      </div>
    </div>`:""}
  </article>`;
}
function onCaseClick(e){
  const el = e.target.closest("[data-act]"); if(!el) return;
  const art = el.closest(".case"); const id = art?.dataset.id; const c = S.casi.find(x=>x.id===id); if(!c) return;
  const act = el.dataset.act;
  if (act==="toggle"){ S.open.has(id)?S.open.delete(id):S.open.add(id); renderAll(); }
  if (act==="copy") copySolution(c, el);
  if (act==="copyEn") copySolutionEn(c, el);
  if (act==="edit") startEdit(c);
  if (act==="del"){
    if (!el.classList.contains("armed")){ el.classList.add("armed"); el.textContent="Conferma eliminazione"; setTimeout(()=>{ if(el.isConnected){el.classList.remove("armed"); el.textContent="Elimina";} },4000); return; }
    S.db.doc("casi/"+id).delete().then(async ()=>{ toast("Caso eliminato"); if(S.assets) for(const f of c.foto||[]){ try{ await S.assets.delete(pathOf(f)); }catch{} } }).catch(dbErr);
  }
}

/* ---------- foto ---------- */
const isPdf = f => /pdf/.test(f.tipo||"");
const pathOf = f => f.path || (f.id + (isPdf(f) ? ".pdf" : ".jpg"));
const urlOf = f => S.urls[pathOf(f)] || "";
function thumb(f, removable){
  const src = urlOf(f);
  const inner = isPdf(f) ? `<span class="pdf">PDF<br>${esc((f.nome||"").slice(0,24))}</span>` : `<img src="${src}" alt="${esc(f.nome||"Foto")}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'meta',textContent:'Non disponibile'}))">`;
  const open = isPdf(f) ? `<a class="thumb" href="${src}" target="_blank" rel="noopener" title="${esc(f.nome||"")}">${inner}</a>` : `<button type="button" class="thumb" data-lb="${esc(f.id)}" title="${esc(f.nome||"")}">${inner}</button>`;
  return removable ? `<span style="position:relative;display:inline-flex">${open}<button type="button" class="x" data-rmfoto="${esc(f.id)}" aria-label="Togli">×</button></span>` : open;
}
ROOT.addEventListener("click", e => {
  const t = e.target.closest("[data-lb]"); if (t){ const f = [...S.casi.flatMap(c=>c.foto||[]), ...S.formFoto].find(x=>x.id===t.dataset.lb); $("lbImg").src = f ? urlOf(f) : ""; $("lb").hidden=false; return; }
  if (e.target.id==="lb" || e.target.id==="lbClose"){ $("lb").hidden=true; $("lbImg").removeAttribute("src"); }
  const r = e.target.closest("[data-rmfoto]"); if (r){ S.formFoto = S.formFoto.filter(f=>f.id!==r.dataset.rmfoto); renderFormFoto(); }
});
ROOT.addEventListener("keydown", e => { if (e.key==="Escape" && !$("lb").hidden) $("lb").hidden=true; });
function renderFormFoto(){ $("fGallery").innerHTML = S.formFoto.map(f=>thumb(f,true)).join("") + (S.uploading?`<span class="thumb up">Caricamento ${S.uploading}…</span>`:""); }
async function shrink(file){
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600000) return file;
  try {
    const bmp = await createImageBitmap(file); const k = Math.min(1, 1800/Math.max(bmp.width,bmp.height));
    const cv = document.createElement("canvas"); cv.width=Math.round(bmp.width*k); cv.height=Math.round(bmp.height*k);
    cv.getContext("2d").drawImage(bmp,0,0,cv.width,cv.height);
    const b = await new Promise(r=>cv.toBlob(r,"image/jpeg",0.82)); return b && b.size<file.size ? b : file;
  } catch { return file; }
}
const AERR = { too_large:"file oltre 20 MB", unsupported_type:"formato non supportato", quota_or_state:"spazio dell'archivio esaurito", rate_limited:"troppi caricamenti ravvicinati, riprova tra poco" };
async function addFiles(files){
  if (!S.assets) return;
  for (const file of files){
    S.uploading = (S.uploading||0)+1; renderFormFoto();
    try {
      const blob = await shrink(file);
      const type = blob.type || (/\.pdf$/i.test(file.name)?"application/pdf":"image/jpeg");
      const r = await S.assets.upload(blob, { type });
      S.formFoto.push({ id:r.id, path:r.path, tipo:r.contentType, nome:file.name }); S.urls[r.path]=r.url;
      $("fotoMsg").textContent="";
    } catch(e){ $("fotoMsg").textContent = `${file.name}: ${AERR[e?.code]||"caricamento non riuscito"}`; }
    S.uploading--; renderFormFoto();
  }
}
$("fFoto").onchange = e => { addFiles([...e.target.files]); e.target.value=""; };
const dz=$("drop");
dz.addEventListener("dragover", e=>{ e.preventDefault(); dz.classList.add("over"); });
dz.addEventListener("dragleave", ()=>dz.classList.remove("over"));
dz.addEventListener("drop", e=>{ e.preventDefault(); dz.classList.remove("over"); addFiles([...e.dataTransfer.files].filter(f=>/^image\/|pdf/.test(f.type))); });
ROOT.addEventListener("paste", e => { if ($("v-nuovo").hidden || !S.assets) return; const imgs=[...(e.clipboardData?.files||[])].filter(f=>/^image\//.test(f.type)); if (imgs.length){ e.preventDefault(); addFiles(imgs); } });
ROOT.addEventListener("keydown", e => { if ((e.key==="Enter"||e.key===" ") && e.target.matches?.('[data-act="toggle"]')){ e.preventDefault(); e.target.click(); } });
$("results").addEventListener("click", onCaseClick);
$("archList").addEventListener("click", onCaseClick);

async function copySolution(c, btn){
  const txt = `Gentile cliente,\nper il problema "${c.titolo}"${c.codice?` (allarme ${c.codice})`:""} sulla ${c.macchina}, la soluzione è:\n\n${c.soluzione}\n\nSe il problema persiste ci ricontatti.\nService Kimatic`;
  try { await navigator.clipboard.writeText(txt); toast("Soluzione copiata: incollala nella risposta al cliente"); }
  catch { const ta=document.createElement("textarea"); ta.value=txt; ta.style.minHeight="160px"; btn.closest(".case-b").append(ta); ta.focus(); ta.select(); toast("Testo selezionato: copialo con Ctrl+C"); }
}
async function copySolutionEn(c, btn){
  let tit = c.titolo_en, sol = c.soluzione_en;
  if (!tit || !sol){
    if (!S.sampleAny){ toast("Questo caso non ha ancora la traduzione in inglese."); return; }
    const old = btn.textContent; btn.disabled = true; btn.textContent = "Traduzione in corso…";
    try {
      const out = await S.sampleAny.json(`Translate from Italian into clear, professional technical English, to be sent to a customer of an industrial machine manufacturer. Keep numbering and line breaks, part codes, alarm codes, values, units and names unchanged. Do not add or remove content. Reply only with JSON {"titolo_en":"...","soluzione_en":"..."}.\n\nTITOLO:\n${c.titolo}\n\nSOLUZIONE:\n${c.soluzione}`, { modelTier:"quick" });
      tit = String(out?.titolo_en || ""); sol = String(out?.soluzione_en || "");
      if (!tit || !sol) throw { code:"invalid_json" };
      if (S.canWrite && S.db){ try { await S.db.doc("casi/"+c.id).update({ titolo_en:tit, soluzione_en:sol }); } catch {} }
    } catch(e){ toast(ERR[e?.code] || "Traduzione non riuscita, riprova tra poco."); return; }
    finally { btn.disabled = false; btn.textContent = old; }
  }
  const txt = `Dear Customer,\nregarding the issue "${tit}"${c.codice?` (alarm ${c.codice})`:""} on your ${c.macchina}, please find the solution below:\n\n${sol}\n\nShould the problem persist, please do not hesitate to contact us.\nKind regards,\nKimatic Service`;
  try { await navigator.clipboard.writeText(txt); toast("Soluzione in inglese copiata: incollala nella risposta al cliente"); }
  catch { const ta=document.createElement("textarea"); ta.value=txt; ta.style.minHeight="160px"; btn.closest(".case-b").append(ta); ta.focus(); ta.select(); toast("Testo selezionato: copialo con Ctrl+C"); }
}

/* ---------- liste (macchine / argomenti) ---------- */
function allOf(key, field){ return [...new Set([...(S.liste[key]||[]), ...S.casi.map(c=>c[field]).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,"it")); }
function fillSelect(sel, items, first, keep=true){
  const v = sel.value; sel.innerHTML = (first?`<option value="">${first}</option>`:"") + items.map(i=>`<option>${esc(i)}</option>`).join("");
  if (keep && [...sel.options].some(o=>o.value===v)) sel.value=v;
}
function renderLists(){
  const M = allOf("macchine","macchina"), A = allOf("argomenti","argomento");
  fillSelect($("qMac"), M, "Tutte le macchine"); fillSelect($("qArg"), A, "Tutti gli argomenti");
  fillSelect($("aMac"), M, "Tutte"); fillSelect($("aArg"), A, "Tutti");
  for (const [sel, items, ph] of [[$("fMac"),M,"macchina"],[$("fArg"),A,"argomento"]]){
    const v = sel.value;
    sel.innerHTML = `<option value="">Scegli ${ph}…</option>` + items.map(i=>`<option>${esc(i)}</option>`).join("") + `<option value="__new">+ Nuova ${ph}…</option>`;
    if ([...sel.options].some(o=>o.value===v)) sel.value=v;
  }
  const chips = (items, field) => items.map(i => { const used = S.casi.some(c=>c[field]===i); return `<span class="chip">${esc(i)}${S.canWrite&&!used?`<button title="Togli" data-rm="${esc(i)}" data-f="${field}">×</button>`:""}</span>`; }).join("") || `<span class="meta">Nessuna voce</span>`;
  $("lMac").innerHTML = chips(M,"macchina"); $("lArg").innerHTML = chips(A,"argomento");
}
async function saveLists(next){ try { await S.db.doc("config/liste").set(next); } catch(e){ dbErr(e); } }
function addToList(key, name){
  name = name.trim(); if(!name) return;
  const cur = S.liste[key]||[]; if (cur.some(x=>x.toLowerCase()===name.toLowerCase())) return;
  return saveLists({ ...S.liste, [key]: [...cur, name] });
}
$("lMacAdd").onclick = () => { addToList("macchine", $("lMacIn").value); $("lMacIn").value=""; };
$("lArgAdd").onclick = () => { addToList("argomenti", $("lArgIn").value); $("lArgIn").value=""; };
ROOT.addEventListener("click", e => {
  const b = e.target.closest("[data-rm]"); if(!b) return;
  const key = b.dataset.f==="macchina"?"macchine":"argomenti";
  saveLists({ ...S.liste, [key]: (S.liste[key]||[]).filter(x=>x!==b.dataset.rm) });
});

/* ---------- archivio ---------- */
function renderArchive(){
  const M = allOf("macchine","macchina"), A = allOf("argomenti","argomento");
  const cnt = (m,a) => S.casi.filter(c=>c.macchina===m && c.argomento===a).length;
  $("mxInfo").textContent = `${S.casi.length} casi · ${M.length} macchine · ${A.length} argomenti`;
  $("matrix").innerHTML = M.length&&A.length ? `<thead><tr><th>Macchina</th>${A.map(a=>`<th>${esc(a)}</th>`).join("")}<th>Totale</th></tr></thead><tbody>` +
    M.map(m => `<tr><td><b>${esc(m)}</b></td>${A.map(a=>{const n=cnt(m,a);return n?`<td><button data-mx-m="${esc(m)}" data-mx-a="${esc(a)}">${n}</button></td>`:`<td class="z">·</td>`}).join("")}<td><button data-mx-m="${esc(m)}" data-mx-a="">${S.casi.filter(c=>c.macchina===m).length}</button></td></tr>`).join("") + `</tbody>`
    : `<tbody><tr><td class="meta" style="padding:16px">Aggiungi macchine e argomenti, oppure registra il primo caso.</td></tr></tbody>`;
  const m=$("aMac").value, a=$("aArg").value;
  const list = S.casi.filter(c=>(!m||c.macchina===m)&&(!a||c.argomento===a)).sort((x,y)=>(x.macchina||"").localeCompare(y.macchina||"","it")||(x.argomento||"").localeCompare(y.argomento||"","it")||(y.data||"").localeCompare(x.data||""));
  $("archList").innerHTML = list.map(c=>card(c)).join("") || `<div class="empty">${S.db?"Nessun caso con questi filtri.":"Archivio in caricamento…"}</div>`;
  const ex = S.casi.filter(c=>c.esempio).length; $("exNotice").hidden = !ex || !S.gestisce;
}
$("matrix").addEventListener("click", e => { const b=e.target.closest("[data-mx-m]"); if(!b) return; $("aMac").value=b.dataset.mxM; $("aArg").value=b.dataset.mxA; renderArchive(); $("archList").scrollIntoView({behavior:"smooth",block:"start"}); });
$("aMac").onchange = $("aArg").onchange = renderArchive;
$("exDel").onclick = async (e) => {
  const b=e.currentTarget; if(!b.classList.contains("armed")){ b.classList.add("armed"); b.textContent="Conferma: elimina gli esempi"; return; }
  b.disabled=true; for (const c of S.casi.filter(c=>c.esempio)){ try{ await S.db.doc("casi/"+c.id).delete(); }catch(err){ dbErr(err); break; } }
  b.disabled=false; b.classList.remove("armed"); b.textContent="Elimina gli esempi"; toast("Esempi eliminati");
};

/* ---------- form ---------- */
for (const [sel, inp] of [["fMac","fMacNew"],["fArg","fArgNew"]]) $(sel).addEventListener("change", () => { $(inp).hidden = $(sel).value!=="__new"; if(!$(inp).hidden) $(inp).focus(); });
function setSel(sel, inp, val){
  val = (val||"").trim(); $(inp).hidden=true; $(inp).value="";
  if (!val){ $(sel).value=""; return; }
  const opt=[...$(sel).options].find(o=>o.value.toLowerCase()===val.toLowerCase());
  if (opt) $(sel).value=opt.value; else { $(sel).value="__new"; $(inp).hidden=false; $(inp).value=val; }
}
function fillForm(c){
  setSel("fMac","fMacNew",c.macchina); setSel("fArg","fArgNew",c.argomento);
  $("fTit").value=c.titolo||""; $("fCod").value=c.codice||""; $("fSin").value=c.sintomi||""; $("fCau").value=c.causa||"";
  $("fSol").value=c.soluzione||""; $("fKey").value=c.parole||""; $("fCli").value=c.cliente||""; $("fTec").value=c.tecnico||"";
  $("fFon").value=c.fonte||"Email"; $("fDat").value=c.data||today();
  S.formFoto = [...(c.foto||[])]; renderFormFoto();
}
function clearForm(){ fillForm({}); S.editId=null; $("formTitle").textContent="Registra un caso risolto"; $("fCancel").hidden=true; $("fSave").textContent="Salva caso"; $("formMsg").textContent=""; }
function startEdit(c){ go("nuovo"); S.queue=[]; renderQueue(); S.editId=c.id; fillForm(c); $("formTitle").textContent="Modifica caso"; $("fCancel").hidden=false; $("fSave").textContent="Salva modifiche"; window.scrollTo({top:0}); }
$("fCancel").onclick = clearForm;
$("form").addEventListener("submit", async e => {
  e.preventDefault(); if(!S.db) return;
  const mac = $("fMac").value==="__new" ? $("fMacNew").value.trim() : $("fMac").value;
  const arg = $("fArg").value==="__new" ? $("fArgNew").value.trim() : $("fArg").value;
  const c = { macchina:mac, argomento:arg, titolo:$("fTit").value.trim(), codice:$("fCod").value.trim(), sintomi:$("fSin").value.trim(), causa:$("fCau").value.trim(), soluzione:$("fSol").value.trim(), parole:$("fKey").value.trim(), cliente:$("fCli").value.trim(), tecnico:$("fTec").value.trim(), fonte:$("fFon").value, data:$("fDat").value||today(), foto:S.formFoto };
  if (S.uploading){ $("formMsg").textContent = "Attendi la fine del caricamento delle foto."; return; }
  const missing = [["macchina","Macchina"],["argomento","Argomento"],["titolo","Titolo"],["sintomi","Sintomi"],["soluzione","Soluzione"]].filter(([k])=>!c[k]).map(([,l])=>l);
  if (missing.length){ $("formMsg").textContent = "Mancano: " + missing.join(", "); return; }
  $("fSave").disabled=true;
  try {
    const L = { ...S.liste }; let changed=false;
    if (!(L.macchine||[]).includes(mac)){ L.macchine=[...(L.macchine||[]),mac]; changed=true; }
    if (!(L.argomenti||[]).includes(arg)){ L.argomenti=[...(L.argomenti||[]),arg]; changed=true; }
    if (changed) await S.db.doc("config/liste").set(L);
    c.aggiornato = new Date().toISOString();
    if (S.editId) await S.db.doc("casi/"+S.editId).set(c); else await S.db.collection("casi").add(c);
    toast(S.editId ? "Modifiche salvate" : "Caso salvato in archivio");
    const wasEdit = !!S.editId; clearForm();
    if (!wasEdit && S.queue.length) nextInQueue();
  } catch(err){ dbErr(err); } finally { $("fSave").disabled=false; }
});

/* ---------- import con Claude ---------- */
function renderQueue(){
  const on = S.queue.length>0 && S.qi<S.queue.length;
  $("queueInfo").hidden = $("queueSkip").hidden = !on;
  if (on) $("queueInfo").textContent = `Caso estratto ${S.qi+1} di ${S.queue.length}: controlla e salva`;
}
function nextInQueue(){ S.qi++; if (S.qi<S.queue.length){ fillForm(S.queue[S.qi]); } else { S.queue=[]; toast("Tutti i casi estratti sono stati esaminati"); } renderQueue(); }
$("queueSkip").onclick = () => { clearForm(); nextInQueue(); };
$("impFile").onchange = async e => { const f=e.target.files[0]; if(!f) return; $("impText").value = await f.text(); if(/whatsapp|chat/i.test(f.name)) $("impFonte").value="WhatsApp"; e.target.value=""; };
$("impStop").onclick = () => S.impCtl?.abort();
const ERR = { not_granted:"Uso di Claude non autorizzato in questa pagina.", sampling_disabled:"Claude non è disponibile per questo account.", rate_limited:"Troppe richieste ravvicinate: riprova tra qualche minuto.", prompt_too_large:"Testo troppo lungo: incollane una parte alla volta.", invalid_json:"Risposta non leggibile: riprova o accorcia il testo.", refused:"Claude non ha elaborato questo testo.", session_expired:"Sessione scaduta: accedi di nuovo." };
$("impGo").onclick = async () => {
  const txt = $("impText").value.trim(); const msg=$("impMsg");
  if (!txt){ msg.hidden=false; msg.textContent="Incolla prima il testo di un'email o di una chat."; return; }
  const fonte = $("impFonte").value;
  const prompt = `Lavori per il reparto service di Kimatic, costruttore di macchine. Leggi il testo qui sotto (${fonte}, conversazione tra tecnici e clienti) e individua SOLO i problemi tecnici che risultano RISOLTI, con la soluzione effettivamente applicata. Ignora saluti, logistica, offerte e problemi rimasti aperti.

Macchine già catalogate: ${allOf("macchine","macchina").join(", ")||"nessuna"}
Argomenti già catalogati: ${allOf("argomenti","argomento").join(", ")||"nessuno"}
Usa questi nomi esatti quando corrispondono; altrimenti proponi un nome breve (per l'argomento una categoria generale, es. Idraulica, Elettrico, Software/PLC, Meccanica, Pneumatica, Sicurezze).

Rispondi solo con un array JSON (vuoto [] se non ci sono casi risolti). Ogni elemento:
{"macchina":"","argomento":"","titolo":"frase breve che descrive il problema","codice":"codice allarme/errore se presente, altrimenti \\"\\"","sintomi":"cosa ha osservato il cliente","causa":"causa individuata, se nota","soluzione":"passi numerati della soluzione, chiari per un altro tecnico","parole":"5-8 parole chiave separate da virgola, con sinonimi che userebbe un cliente","cliente":"nome cliente se presente","tecnico":"nome tecnico se presente","data":"AAAA-MM-GG se deducibile, altrimenti \\"\\""}
Scrivi in italiano.

TESTO:
"""
${txt.slice(0,150000)}
"""`;
  S.impCtl = new AbortController();
  $("impGo").disabled=true; $("impStop").hidden=false; msg.hidden=false; msg.textContent="Claude sta leggendo il testo… (può richiedere fino a un minuto)";
  try {
    const out = await S.sample.json(prompt, { signal:S.impCtl.signal });
    const arr = (Array.isArray(out)?out:[out]).filter(x=>x&&typeof x==="object"&&(x.titolo||x.soluzione));
    if (!arr.length){ msg.textContent="Non ho trovato problemi risolti in questo testo."; return; }
    S.queue = arr.map(x => ({ ...Object.fromEntries(Object.entries(x).map(([k,v])=>[k,String(v??"")])), fonte, data: /^\d{4}-\d{2}-\d{2}$/.test(x.data||"")?x.data:today() }));
    S.qi=0; S.editId=null; fillForm(S.queue[0]); renderQueue();
    msg.textContent = `Trovati ${arr.length} casi risolti. Controlli qui sotto, correggi se serve e salva.`;
    $("form").scrollIntoView({behavior:"smooth",block:"start"});
  } catch(e){
    msg.textContent = e?.code==="cancelled" ? "Estrazione interrotta." : (ERR[e?.code] || "Estrazione non riuscita: riprova tra poco.");
    if (["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(e?.code)) $("importBox").hidden=true;
  } finally { $("impGo").disabled=false; $("impStop").hidden=true; }
};

/* ---------- navigazione ---------- */
const TABS=["cerca","nuovo","archivio"];
function go(t){
  if(!TABS.includes(t)) t="cerca";
  for (const x of TABS){ $("v-"+x).hidden = x!==t; ROOT.querySelector(`[data-tab="${x}"]`).setAttribute("aria-selected", x===t); }
  if (t==="archivio") renderArchive();
}
ROOT.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => go(b.dataset.tab));
let deb; ["q","qMac","qArg"].forEach(id => $(id).addEventListener("input", () => { clearTimeout(deb); deb=setTimeout(search,120); }));
$("qClear").onclick = () => { $("q").value=""; $("qMac").value=""; $("qArg").value=""; search(); $("q").focus(); };

function renderAll(){ renderLists(); search(); if(!$("v-archivio").hidden) renderArchive(); }
function dbErr(e){ const m = e?.code==="quota_exceeded"?"Archivio pieno: elimina casi vecchi.":e?.code==="invalid_argument"?"Non hai i permessi per modificare l'archivio.":"Salvataggio non riuscito, riprova."; toast(m); if(e?.code==="invalid_argument"){ S.canWrite=false; applyWrite(); } }
function applyWrite(){ ROOT.querySelector('[data-tab="nuovo"]').hidden = !S.canWrite; renderAll(); }

go(location.hash.slice(1)); fillForm({}); renderLists();

/* ---------- avvio nel gestionale ---------- */
S.canWrite = CTX.modifica; applyWrite();
S.db = CTX.db;
async function firmaFoto(){
  const mancanti = [...new Set(S.casi.flatMap(c => (c.foto||[]).map(pathOf)))].filter(p => !S.urls[p]);
  if (!mancanti.length) return;
  try { Object.assign(S.urls, await CTX.files.urls(mancanti)); renderAll(); } catch {}
}
const stop1 = S.db.collection("casi").onSnapshot(snap => {
  S.casi = snap.docs.map(d => { const c={ id:d.id, ...d.data() }; index(c); return c; });
  renderAll(); firmaFoto();
}, e => dbErr(e));
const stop2 = S.db.doc("config/liste").onSnapshot(s => { const d=s.exists?s.data():{}; S.liste={ macchine:[...(d.macchine||[])], argomenti:[...(d.argomenti||[])] }; renderAll(); });
if (S.canWrite){ S.assets = CTX.files; $("fotoField").hidden=false; }
return () => { stop1 && stop1(); stop2 && stop2(); CTX.db.stop(); };

}
