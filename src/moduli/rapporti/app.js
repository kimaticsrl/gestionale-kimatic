// @ts-nocheck
// Modulo Rapporti d'intervento: interfaccia portata dalla versione su claude.ai.
// Stessa logica e stessi dati; il salvataggio passa da Supabase (vedi dati.js).
import { RI } from './pdf.js';
import { pdfReport } from './reportOre.js';

export function avvia(ROOT, CTX) {
const APP = ROOT.querySelector('[data-ri=app]'), TABS = ROOT.querySelector('[data-ri=tabs]'), SYNC = ROOT.querySelector('[data-ri=sync]'), TOAST = ROOT.querySelector('[data-ri=toast]');

;
const $=s=>ROOT.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=m=>{const t=TOAST;t.textContent=m;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,3800)};
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const GG=['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
const H=n=>RI.hrs(n)+' h';
const rid=()=>Math.random().toString(36).slice(2,8);

let db=null,ME=null,ADMIN=false,CAN_EDIT=false,DL=null,BOOT=true,LOGO=null;
const busy=()=>{const a=document.activeElement;if(!ROOT.contains(a))return false;return !!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.type!=='checkbox'&&a.type!=='radio')};
const S={rapporti:{},clienti:{},fatture:{}};
const UI={tab:'int',filt:'aperti',q:'',open:null,cli:null,cq:'',sign:false,cliEdit:null,fatt:null};
try{Object.assign(UI,JSON.parse(localStorage.getItem('ri_ui')||'{}'));UI.sign=false;UI.cliEdit=null;UI.fatt=null}catch(e){}
const saveUI=()=>{try{localStorage.setItem('ri_ui',JSON.stringify({tab:UI.tab,filt:UI.filt,open:UI.open,cli:UI.cli}))}catch(e){}};
let CUR=null,DIRTY=false,SAVING=false,ST=null;

/* ---------- stato del rapporto ---------- */
const stato=r=>{if(!r.firma||!r.firma.ts)return'bozza';return S.fatture[r.id]?'fatturato':'dafatt'};
const STL={bozza:['In corso','acc'],dafatt:['Firmato · da fatturare','warn'],fatturato:['Fatturato','ok']};
const pill=r=>{const s=STL[stato(r)];return `<span class="pill ${s[1]}">${s[0]}</span>`};
const range=r=>{const d=(r.giorni||[]).map(g=>g.d).filter(Boolean).sort();return d.length?(d.length===1?RI.fd(d[0]):RI.fd(d[0])+' – '+RI.fd(d[d.length-1])):'nessuna giornata'};

/* ---------- impronta per riconoscere modifiche dopo la firma ---------- */
const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':(v&&typeof v==='object')?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v??null);
const content=r=>({num:r.num,tipo:r.tipo,cli:r.cli,matr:r.matr,macDesc:r.macDesc,oreMac:r.oreMac,sacchi:r.sacchi,tecnici:r.tecnici,giorni:r.giorni,ric:r.ric,note:r.note,firma:{cli:r.firma&&r.firma.cli,cliNome:r.firma&&r.firma.cliNome,tec:r.firma&&r.firma.tec,tecNome:r.firma&&r.firma.tecNome,ts:r.firma&&r.firma.ts}});
async function digest(r){if(!(window.crypto&&crypto.subtle))return'';const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canon(content(r))));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const INTEG={};
async function checkInteg(r){if(!r.firma||!r.firma.hash)return;const h=await digest(r);if(!h)return;const ok=h===r.firma.hash;if(INTEG[r.id]!==ok){INTEG[r.id]=ok;render()}}

/* ---------- database ---------- */
function newRap(){
  const d=new Date(),yy=String(d.getFullYear()).slice(2),md=String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  const id='r'+Date.now().toString(36)+rid();
  return{id,num:'RI-'+yy+md+'-'+rid().slice(0,3).toUpperCase(),tipo:'man',cli:{id:'',nome:'',indirizzo:'',contatto:''},matr:'',macDesc:'',oreMac:'',sacchi:'',tecnici:CTX.nome||'',
    giorni:[{id:rid(),d:today(),v:{},vr:{},tr:{},f:[{da:'08:00',a:'12:00'},{da:'13:00',a:'17:00'}],nt:'1',gar:false,att:''}],ric:[],note:'',by:ME||'',cr:new Date().toISOString()};
}
function queueSave(){DIRTY=true;setSync('Modifiche da salvare…');clearTimeout(ST);ST=setTimeout(flush,700)}
async function flush(){
  if(!CUR||!db||SAVING||!DIRTY)return;SAVING=true;DIRTY=false;
  const r=Object.assign({},CUR,{agg:new Date().toISOString()});delete r.id;
  try{await db.doc('rapporti/'+CUR.id).set(JSON.parse(JSON.stringify(r)));setSync('Salvato '+new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}))}
  catch(e){DIRTY=true;setSync('Non salvato: controlla la connessione');toast('Salvataggio non riuscito. Riprovo appena torna la connessione.');setTimeout(flush,5000)}
  SAVING=false;if(DIRTY)flush();
}
const setSync=t=>{if(SYNC)SYNC.textContent=t};


/* ---------- navigazione ---------- */
function tabs(){
  const nf=Object.values(S.rapporti).filter(r=>stato(r)==='dafatt').length;
  const T=[['int','Interventi'],...(ADMIN?[['fat','Da fatturare',nf]]:[]),['cli','Clienti']];
  TABS.innerHTML=T.map(([k,l,n])=>`<button type="button" data-tab="${k}" aria-pressed="${UI.tab===k}">${l}${n?`<span class="n">${n}</span>`:''}</button>`).join('');
}
TABS.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;flush();UI.tab=b.dataset.tab;UI.open=null;CUR=null;UI.sign=false;saveUI();render()});

function render(){
  tabs();
  const a=APP;
  if(!db){a.innerHTML='<div class="empty">Caricamento dei rapporti…</div>';return}
  if(UI.tab==='fat'&&ADMIN)a.innerHTML=vFatt();
  else if(UI.tab==='cli')a.innerHTML=vCli();
  else if(UI.open&&CUR)a.innerHTML=vEdit();
  else{UI.tab='int';a.innerHTML=vList()}
  if(UI.open&&CUR&&UI.sign)initPads();
}

/* ---------- elenco interventi ---------- */
function vList(){
  const q=UI.q.trim().toLowerCase();
  let L=Object.values(S.rapporti).sort((a,b)=>String(b.agg||b.cr).localeCompare(String(a.agg||a.cr)));
  if(UI.filt==='aperti')L=L.filter(r=>stato(r)==='bozza');else if(UI.filt==='firmati')L=L.filter(r=>stato(r)!=='bozza');else if(UI.filt==='miei')L=L.filter(r=>r.by===ME);
  if(q)L=L.filter(r=>[r.num,r.cli&&r.cli.nome,r.matr,r.tecnici,r.macDesc].join(' ').toLowerCase().includes(q));
  const F=[['aperti','In corso'],['firmati','Firmati'],['miei','Creati da me'],['tutti','Tutti']];
  return `<div class="top"><h2>Interventi</h2><span class="sp"></span>${CAN_EDIT?'<button type="button" class="pri" data-act="nuovo">Nuovo intervento</button>':''}</div>
  <div class="filters">${F.map(([k,l])=>`<button type="button" class="sm" data-filt="${k}" aria-pressed="${UI.filt===k}">${l}</button>`).join('')}<input id="q" type="search" placeholder="Cerca cliente, matricola, tecnico…" value="${esc(UI.q)}" aria-label="Cerca"></div>
  ${L.length?`<div class="list">${L.map(r=>{const t=RI.totals(r);return `<button type="button" class="card" data-openr="${esc(r.id)}"><div class="t"><span class="mono" style="font-size:12.5px;color:var(--mut)">${esc(r.num)}</span>${pill(r)}</div><h3>${esc(r.cli&&r.cli.nome||'Cliente da indicare')}</h3><div class="m"><span>${r.tipo==='inst'?'Installazione':'Manutenzione'}</span><span>${esc(range(r))}</span>${r.matr?`<span class="mono">matr. ${esc(r.matr)}</span>`:''}</div><div class="m"><span>${t.giorni} gg</span><span>${H(t.ordU+t.extU)} uomo</span>${t.km?`<span>${t.km} km</span>`:''}${r.tecnici?`<span>${esc(r.tecnici)}</span>`:''}</div></button>`}).join('')}</div>`
  :`<div class="empty">${q||UI.filt!=='tutti'?'Nessun intervento con questi filtri.':'Nessun rapporto ancora. Tocca «Nuovo intervento» quando parti per una trasferta: compili le giornate man mano e a fine intervento fai firmare il cliente.'}</div>`}`;
}

/* ---------- scheda intervento ---------- */
const locked=()=>CUR&&CUR.firma&&CUR.firma.ts;
function cliOpts(){return Object.entries(S.clienti).sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'it')).map(([id,c])=>`<option value="${esc(c.nome)}"></option>`).join('')}
function macOpts(){const c=S.clienti[CUR.cli.id];if(!c)return'';return (c.commesse||[]).flatMap(k=>(k.macchine||[]).filter(m=>/^\d/.test(m.matr||'')).map(m=>`<option value="${esc(m.matr)}">${esc(m.desc+' · comm. '+k.num)}</option>`)).join('')}
function vEdit(){
  const r=CUR,lk=locked(),ro=lk||!CAN_EDIT,dis=ro?' disabled':'',t=RI.totals(r),st=stato(r);
  const head=`<div class="top"><button type="button" data-act="back">← Interventi</button><h2>${esc(r.cli.nome||'Nuovo intervento')}</h2><span class="mono" style="color:var(--mut)">${esc(r.num)}</span>${pill(r)}<span class="sp"></span>${(r.giorni||[]).length?`<button type="button" data-act="orepdf">Report ore (PDF)</button>`:''}${lk?`<button type="button" class="pri" data-act="pdf">Scarica PDF</button>`:''}</div>`;
  const ban=st==='dafatt'?`<div class="banner warn"><b>Firmato dal cliente il ${RI.fd(r.firma.ts.slice(0,10))} alle ${r.firma.ts.slice(11,16)}.</b> È nella coda «Da fatturare». Il rapporto ora è in sola lettura.${INTEG[r.id]===false?' <b>Attenzione: il contenuto è stato modificato dopo la firma.</b>':''}${ADMIN?' <span class="sp"></span><button type="button" class="sm dng" data-act="riapri">Riapri e annulla la firma</button>':''}</div>`
    :st==='fatturato'?`<div class="banner ok"><b>Fatturato</b>${S.fatture[r.id].nf?' · fattura '+esc(S.fatture[r.id].nf):''}${S.fatture[r.id].df?' del '+RI.fd(S.fatture[r.id].df):''}</div>`:'';
  const dati=`<section class="panel"><h2>Dati intervento</h2>
   <div class="seg" role="radiogroup" aria-label="Tipo di intervento"><label><input type="radio" name="tipo" value="man" data-k="tipo" ${r.tipo!=='inst'?'checked':''}${dis}> MANUTENZIONE</label><label><input type="radio" name="tipo" value="inst" data-k="tipo" ${r.tipo==='inst'?'checked':''}${dis}> INSTALLAZIONE</label></div>
   <div class="g" style="margin-top:12px">
    <label class="w2">Ragione sociale<input id="f-cli" list="dl-cli" data-k="cli.nome" value="${esc(r.cli.nome)}" placeholder="Scegli dall'anagrafica o scrivi"${dis} autocomplete="off"></label>
    <label class="w2">Indirizzo<input id="f-ind" data-k="cli.indirizzo" value="${esc(r.cli.indirizzo)}"${dis}></label>
    <label>Persona di riferimento cliente<input id="f-con" data-k="cli.contatto" value="${esc(r.cli.contatto)}"${dis}></label>
    <label>Tecnici BMTEK<input id="f-tec" data-k="tecnici" value="${esc(r.tecnici)}" placeholder="Nome Cognome, Nome Cognome"${dis}></label>
    <label>Matricola macchina<input id="f-mat" list="dl-mac" data-k="matr" value="${esc(r.matr)}"${dis} autocomplete="off"></label>
    <label>Descrizione macchina<input id="f-mde" data-k="macDesc" value="${esc(r.macDesc)}"${dis}></label>
    <label>Ore lavoro macchina<input id="f-ore" data-k="oreMac" inputmode="numeric" value="${esc(r.oreMac)}"${dis}></label>
    <label>Conteggio sacchi<input id="f-sac" data-k="sacchi" inputmode="numeric" value="${esc(r.sacchi)}"${dis}></label>
   </div>
   <datalist id="dl-cli">${cliOpts()}</datalist><datalist id="dl-mac">${macOpts()}</datalist>
   ${r.cli.nome&&!r.cli.id?`<p class="note" style="margin:8px 0 0">Cliente non presente in anagrafica: i dati restano su questo rapporto. ${CTX.clienti?'Puoi aggiungerlo dalla sezione Clienti.':'Chi gestisce l\'Anagrafica clienti può aggiungerlo.'}</p>`:''}
  </section>`;
  const days=(r.giorni||[]).map((g,i)=>vDay(g,i,dis)).join('');
  const giorn=`<section class="panel"><h2>Giornate <small>una scheda per ogni giorno di trasferta, da compilare a fine giornata</small></h2><div style="display:flex;flex-direction:column;gap:12px">${days||'<div class="empty">Nessuna giornata.</div>'}</div>${ro?'':`<div class="row" style="margin-top:12px"><button type="button" data-act="addday">+ Aggiungi giornata</button></div>`}</section>`;
  const ric=`<section class="panel"><h2>Parti sostituite</h2>${(r.ric||[]).length?`<div class="tw"><table class="ric"><thead><tr><th>Codice</th><th>Descrizione</th><th class="n">Q.tà</th><th>In garanzia</th><th></th></tr></thead><tbody>${r.ric.map((x,i)=>`<tr><td><input id="rc${i}" data-k="ric.${i}.cod" value="${esc(x.cod)}" aria-label="Codice"${dis}></td><td><input id="rd${i}" data-k="ric.${i}.des" value="${esc(x.des)}" aria-label="Descrizione"${dis}></td><td style="width:80px"><input id="rq${i}" data-k="ric.${i}.q" value="${esc(x.q)}" inputmode="decimal" aria-label="Quantità"${dis}></td><td><label class="chk"><input id="rg${i}" type="checkbox" data-k="ric.${i}.gar" ${x.gar?'checked':''}${dis}> sì</label></td><td>${ro?'':`<button type="button" class="sm dng" data-delric="${i}" aria-label="Elimina riga">✕</button>`}</td></tr>`).join('')}</tbody></table></div>`:'<p class="note" style="margin:0">Nessuna parte sostituita.</p>'}${ro?'':'<div class="row" style="margin-top:10px"><button type="button" data-act="addric">+ Aggiungi parte</button></div>'}</section>`;
  const note=`<section class="panel"><h2>Note finali</h2><textarea id="f-note" data-k="note" placeholder="Osservazioni, consigli al cliente, attività da programmare"${dis}>${esc(r.note)}</textarea></section>`;
  const sum=`<div class="sum"><div><span>Giornate</span><b>${t.giorni}</b></div><div><span>Ore ordinarie (uomo)</span><b>${RI.hrs(t.ordU)}</b></div><div><span>Ore extra (uomo)</span><b>${RI.hrs(t.extU)}</b></div><div><span>Di cui in garanzia</span><b>${RI.hrs(t.ordG+t.extG)}</b></div><div><span>Viaggio (uomo)</span><b>${RI.hrs(t.viaggioU)}</b></div><div><span>Km</span><b>${t.km}</b></div></div>`;
  let fir;
  if(lk){fir=`<section class="panel"><h2>Firme</h2>${sum}<div class="sigw" style="margin-top:12px"><div class="sig"><span class="lab">Firma del tecnico · ${esc(r.firma.tecNome)}</span><img src="${r.firma.tec}" alt="Firma del tecnico"></div><div class="sig"><span class="lab">Firma del cliente · ${esc(r.firma.cliNome)}</span><img src="${r.firma.cli}" alt="Firma del cliente"></div></div><p class="note">Impronta del rapporto: <span class="mono">${esc(r.firma.hash.slice(0,16))}…</span> ${INTEG[r.id]===true?'· contenuto integro':INTEG[r.id]===false?'· <b style="color:var(--bad)">contenuto modificato dopo la firma</b>':''}</p></section>`}
  else if(!CAN_EDIT){fir=`<section class="panel"><h2>Riepilogo</h2>${sum}<p class="note">Rapporto non ancora firmato dal cliente. Hai accesso in sola lettura.</p></section>`}
  else if(!UI.sign){fir=`<section class="panel"><h2>Chiusura intervento</h2>${sum}<div class="row" style="margin-top:12px"><button type="button" class="pri" data-act="firma">Chiudi l'intervento e fai firmare il cliente</button><button type="button" data-act="pdf">Anteprima PDF</button></div><p class="note">Dopo la firma il rapporto non si può più modificare e passa in fatturazione.</p></section>`}
  else{const miss=[];if(!r.cli.nome)miss.push('la ragione sociale');if(!(r.giorni||[]).length)miss.push('almeno una giornata');if(!r.tecnici)miss.push('il nome dei tecnici');
   fir=`<section class="panel confirm"><h2 style="color:var(--fg);margin:0">Firma del rapporto</h2>${sum}
    ${miss.length?`<div class="banner warn">Prima della firma manca ${miss.join(', ')}.</div>`:''}
    <p style="margin:0">Mostra al cliente il riepilogo (puoi aprire l'anteprima PDF). Con la firma il cliente accetta senza riserve i lavori eseguiti; il servizio sarà fatturato a fine mese.</p>
    <div class="sigw"><div class="sig"><label class="lab">Nome del tecnico che firma<input id="s-tn" value="${esc((r.tecnici||'').split(',')[0].trim())}"></label><canvas id="pad-tec" width="900" height="300" aria-label="Firma del tecnico"></canvas><div class="row"><button type="button" class="sm" data-clr="pad-tec">Cancella</button></div></div>
    <div class="sig"><label class="lab">Nome e cognome di chi firma per il cliente<input id="s-cn" value="${esc(r.cli.contatto)}"></label><canvas id="pad-cli" width="900" height="300" aria-label="Firma del cliente"></canvas><div class="row"><button type="button" class="sm" data-clr="pad-cli">Cancella</button></div></div></div>
    <div class="row"><button type="button" class="pri" data-act="conferma"${miss.length?' disabled':''}>Conferma le firme</button><button type="button" data-act="pdf">Anteprima PDF</button><button type="button" data-act="nofirma">Annulla</button></div></section>`}
  return head+ban+dati+giorn+ric+note+fir+(ro?'':`<div class="row"><span class="sp"></span>${!r.firma&&(r.by===ME||ADMIN)?'<button type="button" class="sm dng" data-act="elimina">Elimina rapporto</button>':''}</div>`);
}
function vDay(g,i,dis){
  const n=RI.d2n(g.d),s=RI.split(g),v=g.v||{},tr=g.tr||{},lk=!!dis;
  const ft=(g.f||[]).map((f,j)=>`<div class="fascia"><span class="ora"><input id="d${i}f${j}a" type="time" data-k="giorni.${i}.f.${j}.da" value="${esc(f.da)}" aria-label="Dalle"${dis}>${lk?'':`<button type="button" class="sm ora-b" data-ora="giorni.${i}.f.${j}.da" title="Inizio adesso">Adesso</button>`}</span><span>–</span><span class="ora"><input id="d${i}f${j}b" type="time" data-k="giorni.${i}.f.${j}.a" value="${esc(f.a)}" aria-label="Alle"${dis}>${lk?'':`<button type="button" class="sm ora-b" data-ora="giorni.${i}.f.${j}.a" title="Fine adesso">Adesso</button>`}</span>${lk?'<span></span>':`<button type="button" class="sm dng" data-delf="${i}.${j}" aria-label="Elimina fascia">✕</button>`}</div>`).join('');
  return `<div class="day"><div class="dh"><input id="d${i}d" type="date" data-k="giorni.${i}.d" value="${esc(g.d)}" aria-label="Data"${dis}><span class="dn">${n!=null?GG[RI.dow(n)]:''}</span><span class="sp"></span>${lk?'':`<button type="button" class="sm dng" data-delday="${i}">Elimina giornata</button>`}</div>
   ${vViaggio(g,i,'v','Viaggio di andata',dis)}
   <div class="blk"><b>Lavoro presso il cliente</b><div class="fasce">${ft}</div>${lk?'':`<div class="row"><button type="button" class="sm" data-addf="${i}">+ Fascia oraria</button></div>`}
    <div class="g"><label>Nr. tecnici<input id="d${i}nt" type="number" min="1" data-k="giorni.${i}.nt" value="${esc(g.nt)}"${dis}></label><label class="chk" style="align-self:end;padding-bottom:8px"><input id="d${i}g" type="checkbox" data-k="giorni.${i}.gar" ${g.gar?'checked':''}${dis}> Intervento in garanzia</label></div>
    <div class="calc" id="calc${i}">${calcTxt(g)}</div></div>
   ${vViaggio(g,i,'vr','Viaggio di ritorno',dis)}
   <div class="blk"><label class="chk" style="margin-top:8px"><input id="d${i}nf" type="checkbox" data-k="giorni.${i}.notte" ${RI.notte(CUR,g)?'checked':''}${dis}> Notte fuori sede (indennità di trasferta)${g.notte==null?' <span class="note">· proposta automatica</span>':''}</label></div>
   <div class="blk"><b>Training</b><div class="g"><label>Dalle<input id="d${i}ta" type="time" data-k="giorni.${i}.tr.da" value="${esc(tr.da)}"${dis}></label><label>Alle<input id="d${i}tb" type="time" data-k="giorni.${i}.tr.a" value="${esc(tr.a)}"${dis}></label><label class="w2">Nome partecipante<input id="d${i}tn" data-k="giorni.${i}.tr.nome" value="${esc(tr.nome)}"${dis}></label></div></div>
   <div class="blk"><b>Attività svolte</b><textarea id="d${i}at" data-k="giorni.${i}.att" placeholder="Cosa è stato fatto oggi, problemi trovati, prove eseguite"${dis}>${esc(g.att)}</textarea></div></div>`;
}
function vViaggio(g,i,k,titolo,dis){
  const v=g[k]||{},lk=!!dis,p=`giorni.${i}.${k}`;
  const ora=(c,lab)=>{const off=v[c+'Off'],z=v[c+'Tz'];return `<label>${lab}<span class="ora"><input id="d${i}${k}${c}" type="time" data-k="${p}.${c}" value="${esc(v[c])}"${dis}>${lk?'':`<button type="button" class="sm ora-b" data-ora="${p}.${c}" title="${lab} adesso">Adesso</button>`}</span>${z?`<span class="note">ora locale · ${esc(z)}${typeof off==='number'?' (UTC'+(off>=0?'+':'−')+String(Math.abs(off/60)).replace('.',',')+')':''}</span>`:''}</label>`};
  const dur=RI.DURV(v);
  return `<div class="blk"><b>${titolo}</b><div class="g">${ora('da','Partenza')}${ora('a','Arrivo')}<label>Km<span class="ora"><input id="d${i}${k}km" inputmode="numeric" data-k="${p}.km" value="${esc(v.km)}"${dis}>${lk?'':`<button type="button" class="sm ora-b" data-km="${p}" title="Calcola i km dalla sede Kimatic all'indirizzo del cliente">Calcola</button>`}</span>${v.kmAuto&&String(v.km)===String(v.kmAuto)?'<span class="note">proposti dal percorso stradale</span>':''}</label><label>Nr. tecnici<input id="d${i}${k}nt" type="number" min="1" data-k="${p}.nt" value="${esc(v.nt)}"${dis}></label></div>${dur?`<div class="calc"><span>Durata <b>${H(dur)}</b></span></div>`:''}</div>`;
}
/* orario esatto del dispositivo (fuso di dove si trova il tecnico) */
function adesso(k){
  const d=new Date(),hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0');
  setK(CUR,k,hh+':'+mm);
  if(/\.(v|vr)\.(da|a)$/.test(k)){let tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}setK(CUR,k+'Off',-d.getTimezoneOffset());setK(CUR,k+'Tz',tz)}
}
/* km dalla sede all'indirizzo del cliente (percorso stradale, sola andata) */
const KM={};
async function calcolaKm(p,silenzioso){
  const c=CUR.cli||{},an=S.clienti[c.id]||{};
  const ind=[c.indirizzo||an.indirizzo,an.provincia,an.paese].filter(Boolean).join(', ');
  if(!(c.indirizzo||an.indirizzo)){if(!silenzioso)toast('Manca l\'indirizzo del cliente: inseriscilo nei dati del rapporto');return}
  try{
    if(!KM[ind]){const res=await fetch('/api/km?'+new URLSearchParams({indirizzo:ind,nome:c.nome||''}));const j=await res.json();if(!res.ok)throw new Error(j.errore||'non calcolati');KM[ind]=j}
    const j=KM[ind];setK(CUR,p+'.km',String(j.km));setK(CUR,p+'.kmAuto',String(j.km));queueSave();render();
    if(!silenzioso)toast(`${j.km} km fino a: ${j.arrivo}`);
  }catch(e){if(!silenzioso)toast('Km non calcolati: '+(e&&e.message||'errore'))}
}
function calcTxt(g){const s=RI.split(g),nt=Math.max(1,+g.nt||1);if(!s.tot)return'Inserisci le fasce orarie di lavoro.';return `<span>Totale <b>${H(s.tot)}</b></span><span>Ordinarie <b>${H(s.tOrd)}</b></span>${s.tExt?`<span class="x">Extra (oltre 8 h) <b>${H(s.tExt)}</b></span>`:''}${nt>1?`<span>Ore uomo <b>${H(s.tot*nt)}</b></span>`:''}`}

/* ---------- binding dei campi ---------- */
function setK(o,k,v){const p=k.split('.');let x=o;for(let i=0;i<p.length-1;i++){const q=p[i];if(x[q]==null)x[q]=/^\d+$/.test(p[i+1])?[]:{};x=x[q]}x[p[p.length-1]]=v}
ROOT.addEventListener('input',onField);ROOT.addEventListener('change',onField);
function onField(e){
  const el=e.target;
  if(el.id==='q'){UI.q=el.value;const p=el.selectionStart;render();const q=$('#q');q.focus();q.setSelectionRange(p,p);return}
  if(el.id==='cq'){UI.cq=el.value;const p=el.selectionStart;render();const q=$('#cq');q.focus();q.setSelectionRange(p,p);return}
  if(el.dataset.ck&&UI.cliEdit){UI.cliEdit[el.dataset.ck]=el.value;return}
  if(el.dataset.fk&&UI.fatt){UI.fatt[el.dataset.fk]=el.value;return}
  if(!CUR||!el.dataset.k||locked()||!CAN_EDIT)return;
  const k=el.dataset.k,v=el.type==='checkbox'?el.checked:el.value;
  if(el.type==='radio'&&!el.checked)return;
  setK(CUR,k,v);
  if(k==='cli.nome'&&e.type==='change'){const hit=Object.entries(S.clienti).find(([,c])=>c.nome.toLowerCase()===String(v).trim().toLowerCase());
    if(hit){const[id,c]=hit;CUR.cli={id,nome:c.nome,indirizzo:CUR.cli.indirizzo||c.indirizzo||'',contatto:CUR.cli.contatto||c.contatto||''}}else CUR.cli.id='';queueSave();render();return}
  if(k==='matr'&&e.type==='change'){const c=S.clienti[CUR.cli.id];const m=c&&(c.commesse||[]).flatMap(x=>x.macchine||[]).find(m=>m.matr===v);if(m&&!CUR.macDesc){CUR.macDesc=m.desc;const f=$('#f-mde');if(f)f.value=m.desc}}
  const mi=/^giorni\.(\d+)\.(f|nt|d)/.exec(k);if(mi){const c=$('#calc'+mi[1]);if(c)c.innerHTML=calcTxt(CUR.giorni[+mi[1]]);if(mi[2]==='d'&&e.type==='change')render()}
  if(e.type==='input'||el.type==='checkbox'||el.type==='radio'||el.type==='date'||el.type==='time')queueSave();
}

/* ---------- azioni ---------- */
ROOT.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.filt){UI.filt=d.filt;saveUI();render();return}
  if(d.openr){openR(d.openr);return}
  if(d.clr){const c=document.getElementById(d.clr);c.getContext('2d').clearRect(0,0,c.width,c.height);c.dataset.ink='';return}
  if(d.opencli){UI.cli=d.opencli;UI.cliEdit=null;saveUI();render();return}
  if(d.fatt){UI.fatt={id:d.fatt,nf:'',df:today(),note:''};render();return}
  if((locked()||!CAN_EDIT)&&CUR&&(d.addf||d.delf||d.delday||d.delric||d.ora||d.km)){return}
  if(d.ora&&CUR){adesso(d.ora);const m=/^(giorni\.\d+\.(?:v|vr))\.da$/.exec(d.ora);if(m){const g=CUR.giorni[+d.ora.split('.')[1]],v=g[d.ora.split('.')[2]]||{};if(!v.km)calcolaKm(m[1],true)}queueSave();render();return}
  if(d.km&&CUR){calcolaKm(d.km);return}
  if(d.addf){const g=CUR.giorni[+d.addf];const last=(g.f||[]).slice(-1)[0];(g.f??=[]).push({da:last&&last.a?last.a:'',a:''});queueSave();render();return}
  if(d.delf){const[i,j]=d.delf.split('.').map(Number);CUR.giorni[i].f.splice(j,1);queueSave();render();return}
  if(d.delday){if(!confirmTwice(b,'Tocca di nuovo per eliminare la giornata'))return;CUR.giorni.splice(+d.delday,1);queueSave();render();return}
  if(d.delric){CUR.ric.splice(+d.delric,1);queueSave();render();return}
  switch(d.act){
    case'nuovo':{const r=newRap();S.rapporti[r.id]=r;CUR=r;UI.open=r.id;UI.sign=false;DIRTY=true;await flush();saveUI();render();scrollTo(0,0);break}
    case'back':flush();UI.open=null;CUR=null;UI.sign=false;saveUI();render();break;
    case'addday':{const L=CUR.giorni,last=L.slice(-1)[0];let nd=today();if(last&&last.d){const n=RI.d2n(last.d);if(n!=null)nd=RI.n2s(n+1)}if(L.some(g=>g.d===nd)&&!L.some(g=>g.d===today()))nd=today();L.push({id:rid(),d:nd,v:{},vr:{},tr:{},f:last&&last.f?last.f.map(f=>({da:f.da,a:f.a})):[{da:'08:00',a:'12:00'},{da:'13:00',a:'17:00'}],nt:last?last.nt:'1',gar:last?last.gar:false,att:''});queueSave();render();break}
    case'addric':(CUR.ric??=[]).push({cod:'',des:'',q:'1',gar:false});queueSave();render();break;
    case'firma':flush();UI.sign=true;render();ROOT.querySelector('.confirm').scrollIntoView({behavior:'smooth',block:'start'});break;
    case'nofirma':UI.sign=false;render();break;
    case'conferma':await doSign(b);break;
    case'pdf':await doPdf(CUR);break;
    case'elimina':if(!confirmTwice(b,'Tocca di nuovo per eliminare il rapporto'))return;try{await db.doc('rapporti/'+CUR.id).delete();delete S.rapporti[CUR.id];DIRTY=false;CUR=null;UI.open=null;saveUI();render();toast('Rapporto eliminato')}catch(err){toast('Non riesco a eliminarlo: riprova')}break;
    case'riapri':if(!confirmTwice(b,'Tocca di nuovo: la firma del cliente verrà cancellata'))return;delete CUR.firma;CUR.riaperto=new Date().toISOString();DIRTY=true;await flush();render();toast('Rapporto riaperto: andrà firmato di nuovo');break;
    case'pdfid':await doPdf(S.rapporti[d.id]);break;
    case'orepdf':await doOrePdf(CUR);break;
    case'orepdfid':await doOrePdf(S.rapporti[d.id]);break;
    case'savefatt':await saveFatt();break;
    case'nofatt':UI.fatt=null;render();break;
    case'annfatt':if(!confirmTwice(b,'Tocca di nuovo per rimetterlo tra i da fatturare'))return;try{await db.doc('fatture/'+d.id).delete();toast('Rimesso tra i da fatturare')}catch(err){toast('Operazione non riuscita')}break;
    case'newcli':UI.cliEdit={id:'',nome:'',indirizzo:'',contatto:'',email:'',telefono:'',piva:'',lingua:'',note:''};render();break;
    case'editcli':{const c=S.clienti[UI.cli];UI.cliEdit=Object.assign({id:UI.cli},{nome:'',indirizzo:'',contatto:'',email:'',telefono:'',piva:'',lingua:'',note:''},c);render();break}
    case'savecli':await saveCli();break;
    case'nocli':UI.cliEdit=null;render();break;
  }
});
function confirmTwice(b,msg){if(b.dataset.armed&&Date.now()-b.dataset.armed<5000)return true;b.dataset.armed=Date.now();toast(msg);return false}
function openR(id){const r=S.rapporti[id];if(!r)return;CUR=JSON.parse(JSON.stringify(r));CUR.id=id;UI.open=id;UI.sign=false;UI.tab='int';saveUI();render();scrollTo(0,0);checkInteg(CUR)}

/* ---------- firma ---------- */
function initPads(){['pad-tec','pad-cli'].forEach(id=>{const c=document.getElementById(id);if(!c||c.dataset.on)return;c.dataset.on=1;const x=c.getContext('2d');x.lineWidth=4.5;x.lineCap='round';x.lineJoin='round';x.strokeStyle='#0b1b4d';let dn=false,lx=0,ly=0;
  const P=e=>{const r=c.getBoundingClientRect();return[(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]};
  c.addEventListener('pointerdown',e=>{dn=true;c.setPointerCapture(e.pointerId);[lx,ly]=P(e);x.beginPath();x.arc(lx,ly,2,0,7);x.fillStyle='#0b1b4d';x.fill();c.dataset.ink=1});
  c.addEventListener('pointermove',e=>{if(!dn)return;const[nx,ny]=P(e);x.beginPath();x.moveTo(lx,ly);x.lineTo(nx,ny);x.stroke();lx=nx;ly=ny});
  ['pointerup','pointercancel','pointerleave'].forEach(t=>c.addEventListener(t,()=>dn=false))})}
function padPng(id){const c=document.getElementById(id);if(!c||!c.dataset.ink)return null;const o=document.createElement('canvas');o.width=600;o.height=200;o.getContext('2d').drawImage(c,0,0,600,200);return o.toDataURL('image/png')}
async function doSign(b){
  const tec=padPng('pad-tec'),cli=padPng('pad-cli'),tn=$('#s-tn').value.trim(),cn=$('#s-cn').value.trim();
  if(!cli||!cn){toast('Serve la firma del cliente e il nome di chi firma');return}
  if(!tec||!tn){toast('Serve la firma e il nome del tecnico');return}
  b.disabled=true;
  const now=new Date(),ts=new Date(now.getTime()-now.getTimezoneOffset()*6e4).toISOString().slice(0,19);
  CUR.firma={cli,cliNome:cn,tec,tecNome:tn,ts,by:ME||''};
  CUR.firma.hash=await digest(CUR);
  DIRTY=true;await flush();
  if(DIRTY){b.disabled=false;toast('Firma non salvata: controlla la connessione e riprova');return}
  S.rapporti[CUR.id]=JSON.parse(JSON.stringify(CUR));INTEG[CUR.id]=true;UI.sign=false;render();scrollTo(0,0);toast('Rapporto firmato');
}

/* ---------- PDF ---------- */
async function doPdf(r){
  if(!r)return;
  if(!DL){toast('Il download dei file non è disponibile in questa vista');return}
  try{const jsPDF=await CTX.jsPDF();const doc=RI.build(jsPDF,r,LOGO);const blob=doc.output('blob');
    const nm=(r.num+' '+(r.cli&&r.cli.nome||'')+(r.firma?'':' BOZZA')).replace(/[\\/:*?"<>|]+/g,' ').trim()+'.pdf';
    await DL.save({filename:nm,data:blob})}
  catch(e){if(e&&e.code==='declined')return;toast('Non riesco a creare il PDF: '+(e&&e.message||'errore'))}
}

/* report ore del singolo rapporto, per l'ufficio amministrativo */
async function doOrePdf(r){
  if(!r)return;
  if(!DL){toast('Il download dei file non è disponibile in questa vista');return}
  try{const jsPDF=await CTX.jsPDF();const blob=pdfReport(jsPDF,r,LOGO,x=>{const c=S.clienti[x.cli&&x.cli.id]||{};return c.paese||''}).output('blob');
    const nm=('Report ore '+r.num+' '+(r.cli&&r.cli.nome||'')).replace(/[\\/:*?"<>|]+/g,' ').trim()+'.pdf';
    await DL.save({filename:nm,data:blob})}
  catch(e){if(e&&e.code==='declined')return;toast('Non riesco a creare il report: '+(e&&e.message||'errore'))}
}

/* ---------- da fatturare ---------- */
function vFatt(){
  const L=Object.values(S.rapporti).filter(r=>r.firma&&r.firma.ts).sort((a,b)=>b.firma.ts.localeCompare(a.firma.ts));
  const da=L.filter(r=>!S.fatture[r.id]),fa=L.filter(r=>S.fatture[r.id]);
  L.forEach(checkInteg);
  const row=(r,done)=>{const t=RI.totals(r),f=S.fatture[r.id];return `<tr><td><b>${esc(r.cli.nome)}</b><br><span class="mono" style="font-size:12px;color:var(--mut)">${esc(r.num)}</span></td><td>${r.tipo==='inst'?'Installazione':'Manutenzione'}<br><span class="note">${esc(range(r))}</span></td><td class="n num">${RI.hrs(t.ordU)}</td><td class="n num">${RI.hrs(t.extU)}</td><td class="n num">${RI.hrs(t.ordG+t.extG)}</td><td class="n num">${RI.hrs(t.viaggioU)}</td><td class="n num">${t.km}</td><td class="n num">${t.ricambi}</td><td>${INTEG[r.id]===false?'<span class="pill bad">Modificato dopo la firma</span>':RI.fd(r.firma.ts.slice(0,10))}</td><td><div class="row"><button type="button" class="sm" data-act="pdfid" data-id="${esc(r.id)}">PDF</button><button type="button" class="sm" data-act="orepdfid" data-id="${esc(r.id)}">Report ore</button><button type="button" class="sm" data-openr="${esc(r.id)}">Apri</button>${done?`<span class="note">${f.nf?'Fatt. '+esc(f.nf):''} ${f.df?RI.fd(f.df):''}</span><button type="button" class="sm" data-act="annfatt" data-id="${esc(r.id)}">Annulla</button>`:`<button type="button" class="sm pri" data-fatt="${esc(r.id)}">Segna fatturato</button>`}</div></td></tr>`};
  const hd='<thead><tr><th>Cliente</th><th>Intervento</th><th class="n">Ore ord.</th><th class="n">Ore extra</th><th class="n">In garanzia</th><th class="n">Viaggio</th><th class="n">Km</th><th class="n">Parti</th><th>Firmato</th><th></th></tr></thead>';
  const form=UI.fatt?`<div class="confirm"><b>Fatturazione di ${esc((S.rapporti[UI.fatt.id]||{}).num)}</b><div class="g"><label>Numero fattura<input id="ff-n" data-fk="nf" value="${esc(UI.fatt.nf)}"></label><label>Data fattura<input id="ff-d" type="date" data-fk="df" value="${esc(UI.fatt.df)}"></label><label class="w2">Note<input id="ff-no" data-fk="note" value="${esc(UI.fatt.note)}"></label></div><div class="row"><button type="button" class="pri" data-act="savefatt">Segna fatturato</button><button type="button" data-act="nofatt">Annulla</button></div></div>`:'';
  return `<div class="top"><h2>Da fatturare</h2><span class="note">Ore in ore uomo (ore × nr. tecnici). Le ore oltre le 8 giornaliere sono extra.</span></div>${form}
  <section class="panel"><h2>In attesa di fattura <small>${da.length}</small></h2>${da.length?`<div class="tw"><table>${hd}<tbody>${da.map(r=>row(r,false)).join('')}</tbody></table></div>`:'<p class="note" style="margin:0">Nessun rapporto firmato in attesa. Quando un tecnico fa firmare il cliente, il rapporto compare qui.</p>'}</section>
  <section class="panel"><h2>Fatturati <small>${fa.length}</small></h2>${fa.length?`<div class="tw"><table>${hd}<tbody>${fa.map(r=>row(r,true)).join('')}</tbody></table></div>`:'<p class="note" style="margin:0">Ancora nessuno.</p>'}</section>`;
}
async function saveFatt(){const f=UI.fatt;if(!f)return;try{await db.doc('fatture/'+f.id).set({stato:'fatturato',nf:f.nf.trim(),df:f.df,note:f.note.trim(),by:ME||'',ts:new Date().toISOString()});UI.fatt=null;toast('Segnato come fatturato')}catch(e){toast('Non salvato: serve il permesso di modifica del modulo')}render()}

/* ---------- clienti ---------- */
function vCli(){
  const q=UI.cq.trim().toLowerCase();
  const L=Object.entries(S.clienti).filter(([,c])=>!q||[c.nome,c.contatto,c.indirizzo,...(c.commesse||[]).flatMap(k=>[k.num,...(k.macchine||[]).map(m=>m.matr)])].join(' ').toLowerCase().includes(q)).sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'it'));
  const c=S.clienti[UI.cli],E=UI.cliEdit;
  let det;
  if(E){det=`<section class="panel"><h2>${E.id?'Modifica cliente':'Nuovo cliente'}</h2><div class="g">${[['nome','Ragione sociale','w2'],['indirizzo','Indirizzo','w2'],['contatto','Persona di riferimento'],['email','E-mail'],['telefono','Telefono'],['piva','P.IVA / VAT'],['lingua','Lingua documenti']].map(([k,l,w])=>`<label class="${w||''}">${l}<input id="ce-${k}" data-ck="${k}" value="${esc(E[k])}"></label>`).join('')}<label class="wf">Note<textarea id="ce-note" data-ck="note">${esc(E.note)}</textarea></label></div><div class="row" style="margin-top:12px"><button type="button" class="pri" data-act="savecli">Salva</button><button type="button" data-act="nocli">Annulla</button></div></section>`}
  else if(c){const used=Object.values(S.rapporti).filter(r=>r.cli&&r.cli.id===UI.cli);
   det=`<section class="panel"><h2>${esc(c.nome)} <small>${(c.fonti||[]).map(esc).join(' · ')}</small></h2><div class="g">${[['Indirizzo',c.indirizzo],['Persona di riferimento',c.contatto],['E-mail',c.email],['Telefono',c.telefono],['P.IVA / VAT',c.piva],['Lingua',c.lingua]].map(([l,v])=>`<div class="lab">${l}<span style="color:var(--fg);font-size:15px">${v?esc(v):'<span class="note">—</span>'}</span></div>`).join('')}</div>${c.note?`<p>${esc(c.note)}</p>`:''}${CTX.clienti?'<div class="row" style="margin-top:12px"><button type="button" data-act="editcli">Modifica</button></div>':''}</section>
   <section class="panel"><h2>Commesse e matricole</h2>${(c.commesse||[]).length?`<div class="mac">${c.commesse.map(k=>`<div><b class="mono">${esc(k.num)}</b>${k.chiusa?'<span class="pill">chiusa</span>':''}<span class="note">${(k.macchine||[]).length} matricole</span></div>${(k.macchine||[]).length?`<div style="padding-left:12px">${k.macchine.map(m=>`<span class="pill acc" title="${esc(m.desc)}"><span class="mono">${esc(m.matr)}</span> ${esc(m.desc.slice(0,28))}</span>`).join('')}</div>`:''}`).join('')}</div>`:'<p class="note" style="margin:0">Nessuna commessa nel Piano produzione.</p>'}</section>
   <section class="panel"><h2>Interventi <small>${used.length}</small></h2>${used.length?used.map(r=>`<button type="button" class="sm" data-openr="${esc(r.id)}" style="margin:0 6px 6px 0">${esc(r.num)} · ${esc(range(r))}</button>`).join(''):'<p class="note" style="margin:0">Nessun intervento registrato.</p>'}</section>`}
  else det=`<div class="empty">Scegli un cliente dall'elenco.</div>`;
  return `<div class="top"><h2>Clienti</h2><span class="note">${Object.keys(S.clienti).length} clienti, presi da Offerte BMTEK e Piano produzione</span><span class="sp"></span>${CTX.clienti?'<button type="button" class="pri" data-act="newcli">Nuovo cliente</button>':''}</div>
  <div class="cli"><div class="panel" style="display:flex;flex-direction:column;gap:8px"><input id="cq" type="search" placeholder="Cerca nome, commessa, matricola…" value="${esc(UI.cq)}" aria-label="Cerca cliente"><div class="clist">${L.map(([id,c])=>`<button type="button" data-opencli="${esc(id)}" aria-current="${UI.cli===id}"><b>${esc(c.nome)}</b><small>${(c.commesse||[]).length} commesse${c.contatto?' · '+esc(c.contatto):''}</small></button>`).join('')||'<p class="note">Nessun cliente.</p>'}</div></div><div style="display:flex;flex-direction:column;gap:14px;min-width:0">${det}</div></div>`;
}
async function saveCli(){const E=UI.cliEdit;if(!E||!E.nome.trim()){toast('Serve la ragione sociale');return}
  const id=E.id||E.nome.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||('c'+rid());
  const prev=S.clienti[id]||{};const doc=Object.assign({},prev,{nome:E.nome.trim(),indirizzo:E.indirizzo.trim(),contatto:E.contatto.trim(),email:E.email.trim(),telefono:E.telefono.trim(),piva:E.piva.trim(),lingua:E.lingua.trim(),note:(E.note||'').trim(),fonti:prev.fonti||['Inserito a mano'],commesse:prev.commesse||[]});
  try{await db.doc('clienti/'+id).set(doc);UI.cli=id;UI.cliEdit=null;saveUI();toast('Cliente salvato')}catch(e){toast('Non salvato: serve il permesso di modifica del modulo')}render()}

/* ---------- avvio ---------- */
let GOT={r:0,c:0};
function refresh(){
  if(!GOT.r||!GOT.c){return}
  if(UI.open&&!CUR&&S.rapporti[UI.open]){openR(UI.open);return}
  if(UI.open&&!S.rapporti[UI.open]&&!CUR){UI.open=null}
  if(busy()){tabs();return}
  render();
}

/* ---------- avvio nel gestionale ---------- */
ME=CTX.me;ADMIN=CTX.gestisce;CAN_EDIT=CTX.modifica;LOGO=CTX.logo;db=CTX.db;DL=CTX.downloads;BOOT=false;
render();
db.collection('rapporti').onSnapshot(qs=>{const o={};qs.docs.forEach(d=>{o[d.id]=Object.assign({id:d.id},d.data())});S.rapporti=o;GOT.r=1;
  if(CUR&&o[CUR.id]&&!DIRTY&&!SAVING&&!UI.sign&&!busy()){const f=o[CUR.id];if(canon(f)!==canon(Object.assign({},CUR,{id:CUR.id}))){CUR=JSON.parse(JSON.stringify(f));checkInteg(CUR)}}
  setSync('Aggiornato');refresh()},()=>{GOT.r=1;setSync('Non riesco a leggere i rapporti');refresh()});
db.collection('clienti').onSnapshot(qs=>{const o={};qs.docs.forEach(d=>{o[d.id]=d.data()});S.clienti=o;GOT.c=1;refresh()},()=>{GOT.c=1;refresh()});
db.collection('fatture').onSnapshot(qs=>{const o={};qs.docs.forEach(d=>{o[d.id]=d.data()});S.fatture=o;refresh()},()=>{});
return ()=>{clearTimeout(ST);if(DIRTY)flush();CTX.db.stop()};
}
