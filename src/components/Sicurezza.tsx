"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Le persone arrivano dall'Anagrafica dipendenti (funzione sic_dipendenti): qui non si inseriscono.
type Dip = { id: string; nome: string; mansione: string | null; reparto: string | null; contratto: string | null; attivo: boolean; assunzione: string | null; fine: string | null; finecontr?: string | null };
type Persona = { rischio?: string; gen?: string; dpi?: string; addestr?: string; preass?: string; period?: string; ultvis?: string; scadvis?: string; note?: string };
type Corso = { dip: string; tipo: string; data?: string; scadenza?: string; ore?: string; note?: string };
type Azienda = { nome: string; mesi?: number; ultimo?: string; prossima?: string; note?: string };
type Sanitari = { idoneo?: string; prescr?: string };
type Infortunio = { data?: string; dip?: string; nome?: string; luogo?: string; desc?: string; prog1?: string; prog2?: string; giorni?: number };
type Doc<T> = { id: string; dati: T };

const TIPI: { k: string; n: string; anni: number }[] = [
  { k: "gen", n: "Formazione generale", anni: 0 },
  { k: "sic", n: "Sicurezza (specifica / aggiornamento)", anni: 5 },
  { k: "car", n: "Carrellisti", anni: 5 },
  { k: "ps", n: "Primo soccorso", anni: 3 },
  { k: "ai", n: "Antincendio", anni: 5 },
  { k: "rls", n: "RLS", anni: 1 },
  { k: "pes", n: "PES-PAV-PEI", anni: 5 },
  { k: "altro", n: "Altro corso", anni: 0 },
];
const COL = ["sic", "car", "ps", "ai", "rls", "pes"];
const BREVE: Record<string, string> = { sic: "Sicurezza", car: "Carrelli", ps: "Primo socc.", ai: "Antincendio", rls: "RLS", pes: "PES-PAV-PEI" };
const PERIOD: Record<string, number> = { Annuale: 12, Biennale: 24, Triennale: 36, Quinquennale: 60 };
const nomeTipo = (k: string) => TIPI.find((t) => t.k === k)?.n ?? k;

const oggi = () => new Date().toLocaleDateString("sv-SE");
const piuMesi = (d: string, m: number) => { const x = new Date(d + "T12:00:00"); x.setMonth(x.getMonth() + m); return x.toLocaleDateString("sv-SE"); };
const fd = (s?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const giorni = (s: string) => Math.round((new Date(s + "T12:00:00").getTime() - new Date(oggi() + "T12:00:00").getTime()) / 864e5);
type Stato = "scad" | "presto" | "ok" | "";
const stato = (s?: string | null): Stato => (!s ? "" : s < oggi() ? "scad" : giorni(s) <= 60 ? "presto" : "ok");
const SFONDO: Record<Stato, string> = { scad: "color-mix(in srgb,var(--danger) 22%,var(--surface))", presto: "color-mix(in srgb,#e8a400 28%,var(--surface))", ok: "color-mix(in srgb,var(--amm) 16%,var(--surface))", "": "" };
const inForza = (d: Dip) => d.attivo && !(d.fine && d.fine < oggi());
const norm = (s?: string | null) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
const inp: React.CSSProperties = { padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)", font: "inherit" };
const lab: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };

export default function Sicurezza({ modifica }: { modifica: boolean }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [tab, setTab] = useState("scad");
  const [dip, setDip] = useState<Dip[]>([]);
  const [pers, setPers] = useState<Record<string, Persona>>({});
  const [corsi, setCorsi] = useState<Doc<Corso>[]>([]);
  const [az, setAz] = useState<Doc<Azienda>[]>([]);
  const [san, setSan] = useState<Record<string, Sanitari>>({});
  const [inf, setInf] = useState<Doc<Infortunio>[]>([]);
  const [carico, setCarico] = useState(true);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [tutti, setTutti] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [edP, setEdP] = useState<Persona>({});
  const [edS, setEdS] = useState<Sanitari>({});
  const [edC, setEdC] = useState<Doc<Corso> | null>(null);
  const [edA, setEdA] = useState<Doc<Azienda> | null>(null);
  const [edI, setEdI] = useState<Doc<Infortunio> | null>(null);
  const [ftipo, setFtipo] = useState("");

  async function carica() {
    const [d, s] = await Promise.all([sb.rpc("sic_dipendenti"), sb.from("sic_docs").select("coll,id,dati")]);
    if (d.error || s.error) setMsg({ t: "Errore nel caricamento: " + (d.error || s.error)?.message, err: true });
    setDip((d.data ?? []) as Dip[]);
    const P: Record<string, Persona> = {}, S: Record<string, Sanitari> = {}, C: Doc<Corso>[] = [], A: Doc<Azienda>[] = [], I: Doc<Infortunio>[] = [];
    ((s.data ?? []) as { coll: string; id: string; dati: never }[]).forEach((x) => {
      if (x.coll === "persona") P[x.id] = x.dati; else if (x.coll === "sanitari") S[x.id] = x.dati;
      else if (x.coll === "corso") {
        // corso senza scadenza scritta: la si calcola dalla data con la validità del tipo
        const c = x.dati as Corso, anni = TIPI.find((t) => t.k === c.tipo)?.anni || 0;
        C.push(!c.scadenza && c.data && anni ? { ...x, dati: { ...c, scadenza: piuMesi(c.data, 12 * anni) } } : x);
      } else if (x.coll === "azienda") A.push(x); else if (x.coll === "infortunio") I.push(x);
    });
    setPers(P); setSan(S); setCorsi(C); setInf(I.sort((a, b) => (b.dati.data || "").localeCompare(a.dati.data || "")));
    setAz(A.sort((a, b) => (a.dati.prossima || "9").localeCompare(b.dati.prossima || "9")));
    setCarico(false);
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function scrivi(coll: string, id: string, dati: unknown, ok: string) {
    const pulito = Object.fromEntries(Object.entries(dati as Record<string, unknown>).filter(([, v]) => v !== "" && v != null));
    const { error } = await sb.from("sic_docs").upsert({ coll, id, dati: pulito });
    if (error) { setMsg({ t: "Non salvato: " + error.message, err: true }); return false; }
    setMsg({ t: ok }); await carica(); return true;
  }
  async function togli(coll: string, id: string, ok: string) {
    const { error } = await sb.from("sic_docs").delete().eq("coll", coll).eq("id", id);
    if (error) { setMsg({ t: "Non eliminato: " + error.message, err: true }); return; }
    setMsg({ t: ok }); await carica();
  }

  const byId = Object.fromEntries(dip.map((d) => [d.id, d]));
  // ultimo corso per persona e tipo (quello con la data più recente)
  const ultimo: Record<string, Record<string, Corso>> = {};
  corsi.forEach(({ dati: c }) => {
    const u = (ultimo[c.dip] ??= {});
    const prev = u[c.tipo];
    if (!prev || (c.data || c.scadenza || "") > (prev.data || prev.scadenza || "")) u[c.tipo] = c;
  });
  const attivi = dip.filter(inForza);

  // Scadenzario: visite, ultimo corso di ogni tipo, scadenze aziendali
  type Riga = { quando: string; cosa: string; chi: string; dip?: string; az?: string };
  const righe: Riga[] = [];
  attivi.forEach((d) => {
    const p = pers[d.id] || {};
    if (d.finecontr) righe.push({ quando: d.finecontr, cosa: "Scadenza contratto" + (d.contratto ? ` (${d.contratto.toLowerCase()})` : ""), chi: d.nome, dip: d.id });
    if (p.scadvis) righe.push({ quando: p.scadvis, cosa: "Visita medica" + (p.period ? ` (${p.period.toLowerCase()})` : ""), chi: d.nome, dip: d.id });
    Object.values(ultimo[d.id] || {}).forEach((c) => { if (c.scadenza) righe.push({ quando: c.scadenza, cosa: nomeTipo(c.tipo), chi: d.nome, dip: d.id }); });
  });
  az.forEach((a) => { if (a.dati.prossima) righe.push({ quando: a.dati.prossima, cosa: a.dati.nome, chi: "Azienda", az: a.id }); });
  righe.sort((a, b) => a.quando.localeCompare(b.quando));
  const scadute = righe.filter((r) => stato(r.quando) === "scad"), presto = righe.filter((r) => stato(r.quando) === "presto");
  const daFare = attivi.flatMap((d) => Object.values(ultimo[d.id] || {}).filter((c) => !c.data && !c.scadenza && c.note).map((c) => ({ d, c })));

  function apriPersona(id: string) {
    setSel(id); setEdP({ ...(pers[id] || {}) }); setEdS({ ...(san[id] || {}) }); setEdC(null); setMsg(null);
  }
  function nuovoCorso(dipId: string, tipo = "sic") {
    setEdC({ id: "", dati: { dip: dipId, tipo, data: oggi(), scadenza: piuMesi(oggi(), 12 * (TIPI.find((t) => t.k === tipo)?.anni || 0)) } });
  }
  const setC = (k: keyof Corso, v: string) => setEdC((e) => {
    if (!e) return e;
    const dati = { ...e.dati, [k]: v };
    const anni = TIPI.find((t) => t.k === dati.tipo)?.anni || 0;
    if ((k === "data" || k === "tipo") && dati.data && anni) dati.scadenza = piuMesi(dati.data, 12 * anni);
    if (k === "tipo" && !anni) dati.scadenza = "";
    return { ...e, dati };
  });

  const cella = (s?: string | null, testo?: string, k?: string) => <td key={k} style={{ background: SFONDO[stato(s)], whiteSpace: "nowrap" }}>{testo ?? fd(s)}</td>;
  const tabs: [string, string][] = [["scad", `Scadenze${scadute.length ? ` (${scadute.length} scadute)` : ""}`], ["dip", "Dipendenti"], ["corsi", "Corsi"], ["az", "Scadenze aziendali"], ...(modifica ? [["inf", "Infortuni"] as [string, string]] : [])];

  if (carico) return <div className="empty">Caricamento…</div>;
  const ds = sel ? byId[sel] : null;
  const vis = dip.filter((d) => (tutti || inForza(d)) && (!q || norm(`${d.nome} ${d.mansione} ${d.reparto}`).includes(norm(q))));

  return (
    <>
      <header><h1>Sicurezza e formazione</h1><p className="sub">Corsi, visite mediche, DPI e scadenze. Le persone arrivano dall&apos;Anagrafica dipendenti: nuovi assunti e uscite si registrano lì.</p></header>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {tabs.map(([k, n]) => <button key={k} className={"btn" + (tab === k ? "" : " sec")} onClick={() => { setTab(k); setMsg(null); }}>{n}</button>)}
      </div>
      {msg && <div className={"msg" + (msg.err ? " err" : "")} style={{ marginBottom: 12 }}>{msg.t}</div>}

      {tab === "scad" && (
        <div className="box">
          <p className="tag" style={{ marginTop: 0 }}>Visite e corsi dei dipendenti in forza e scadenze aziendali: in rosso le scadute, in giallo quelle entro 60 giorni.</p>
          <div className="mx"><table>
            <thead><tr><th>Scadenza</th><th>Cosa</th><th>Chi</th><th></th></tr></thead>
            <tbody>
              {[...scadute, ...presto].map((r, i) => (
                <tr key={i} style={{ cursor: "pointer" }} onClick={() => { if (r.dip) { setTab("dip"); apriPersona(r.dip); } else { setTab("az"); setEdA(az.find((a) => a.id === r.az) || null); } }}>
                  {cella(r.quando)}<td>{r.cosa}</td><td>{r.chi}</td>
                  <td><small>{stato(r.quando) === "scad" ? `scaduta da ${-giorni(r.quando)} giorni` : `tra ${giorni(r.quando)} giorni`}</small></td>
                </tr>
              ))}
              {daFare.map(({ d, c }, i) => (
                <tr key={"f" + i} style={{ cursor: "pointer" }} onClick={() => { setTab("dip"); apriPersona(d.id); }}>
                  <td style={{ background: SFONDO.presto }}>da fare</td><td>{nomeTipo(c.tipo)}</td><td>{d.nome}</td><td><small>{c.note}</small></td>
                </tr>
              ))}
              {!scadute.length && !presto.length && !daFare.length && <tr><td colSpan={4} style={{ color: "var(--muted)" }}>Nessuna scadenza nei prossimi 60 giorni.</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "dip" && ds && (
        <div className="box" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>{ds.nome}</h2>
            <span className="tag" style={{ margin: 0 }}>{[ds.mansione, ds.reparto, ds.contratto, ds.assunzione && "assunto il " + fd(ds.assunzione), ds.finecontr && "contratto fino al " + fd(ds.finecontr), ds.fine && (ds.fine < oggi() ? "uscito il " : "esce il ") + fd(ds.fine)].filter(Boolean).join(" · ")}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 }}>
            <label style={lab}>Rischio<select value={edP.rischio || ""} disabled={!modifica} onChange={(e) => setEdP({ ...edP, rischio: e.target.value })}><option value="">—</option><option value="BASSO">Basso (4 h)</option><option value="ALTO">Alto (12 h)</option></select></label>
            <label style={lab}>Formazione generale<select value={edP.gen || ""} disabled={!modifica} onChange={(e) => setEdP({ ...edP, gen: e.target.value })}><option value="">—</option><option>SI</option><option>NO</option></select></label>
            <label style={lab}>Consegna DPI<input style={inp} value={edP.dpi || ""} disabled={!modifica} placeholder="es. X, non necessario" onChange={(e) => setEdP({ ...edP, dpi: e.target.value })} /></label>
            <label style={lab}>Addestramento<input style={inp} value={edP.addestr || ""} disabled={!modifica} onChange={(e) => setEdP({ ...edP, addestr: e.target.value })} /></label>
            <label style={lab}>Visita preassuntiva<input type="date" style={inp} value={edP.preass || ""} disabled={!modifica} onChange={(e) => setEdP({ ...edP, preass: e.target.value })} /></label>
            <label style={lab}>Periodicità visita<select value={edP.period || ""} disabled={!modifica} onChange={(e) => { const period = e.target.value; setEdP({ ...edP, period, ...(edP.ultvis && PERIOD[period] ? { scadvis: piuMesi(edP.ultvis, PERIOD[period]) } : {}) }); }}><option value="">—</option>{Object.keys(PERIOD).map((p) => <option key={p}>{p}</option>)}</select></label>
            <label style={lab}>Ultima visita<input type="date" style={inp} value={edP.ultvis || ""} disabled={!modifica} onChange={(e) => { const ultvis = e.target.value; setEdP({ ...edP, ultvis, ...(ultvis && PERIOD[edP.period || ""] ? { scadvis: piuMesi(ultvis, PERIOD[edP.period || ""]) } : {}) }); }} /></label>
            <label style={lab}>Scadenza visita<input type="date" style={{ ...inp, background: SFONDO[stato(edP.scadvis)] || "var(--surface)" }} value={edP.scadvis || ""} disabled={!modifica} onChange={(e) => setEdP({ ...edP, scadvis: e.target.value })} /></label>
            {modifica && <>
              <label style={lab}>Idoneo<select value={edS.idoneo || ""} onChange={(e) => setEdS({ ...edS, idoneo: e.target.value })}><option value="">—</option><option>SI</option><option>NO</option></select></label>
              <label style={{ ...lab, gridColumn: "span 2" }}>Prescrizioni del medico (riservato)<input style={inp} value={edS.prescr || ""} onChange={(e) => setEdS({ ...edS, prescr: e.target.value })} /></label>
            </>}
          </div>
          <label style={lab}>Note<textarea rows={2} style={inp} value={edP.note || ""} disabled={!modifica} onChange={(e) => setEdP({ ...edP, note: e.target.value })} /></label>
          <div className="row">
            <span style={{ flex: 1 }} />
            <button className="btn sec" onClick={() => setSel(null)}>Chiudi</button>
            {modifica && <button className="btn" onClick={async () => { const ok = await scrivi("persona", ds.id, edP, `${ds.nome} salvato.`); if (ok && (edS.idoneo || edS.prescr || san[ds.id])) await scrivi("sanitari", ds.id, edS, `${ds.nome} salvato.`); }}>Salva</button>}
          </div>
          <h3 style={{ margin: "8px 0 0" }}>Corsi</h3>
          <div className="mx"><table>
            <thead><tr><th>Corso</th><th>Data</th><th>Scadenza</th><th>Ore</th><th>Note</th></tr></thead>
            <tbody>
              {corsi.filter((c) => c.dati.dip === ds.id).sort((a, b) => (b.dati.data || "").localeCompare(a.dati.data || "")).map((c) => (
                <tr key={c.id} style={{ cursor: modifica ? "pointer" : undefined }} onClick={() => modifica && setEdC(JSON.parse(JSON.stringify(c)))}>
                  <td>{nomeTipo(c.dati.tipo)}</td><td>{fd(c.dati.data)}</td>{cella(ultimo[ds.id]?.[c.dati.tipo] === c.dati ? c.dati.scadenza : null, fd(c.dati.scadenza))}<td>{c.dati.ore}</td><td>{c.dati.note}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {modifica && !edC && <div className="row"><button className="btn sec" onClick={() => nuovoCorso(ds.id)}>Aggiungi corso</button></div>}
          {edC && formCorso()}
        </div>
      )}

      {tab === "dip" && (
        <div className="box">
          <div className="row" style={{ marginBottom: 12 }}>
            <input type="text" placeholder="Cerca nome, mansione, reparto…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
            <label className="ck"><input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} /> Mostra anche chi non è più in forza</label>
            <span className="tag" style={{ margin: 0 }}>{attivi.length} in forza</span>
          </div>
          <div className="mx"><table>
            <thead><tr><th>Nome</th><th>Mansione</th><th>Contratto</th><th>Scad. contratto</th><th>Rischio</th><th>Visita</th>{COL.map((k) => <th key={k}>{BREVE[k]}</th>)}<th>DPI</th></tr></thead>
            <tbody>
              {vis.map((d) => {
                const p = pers[d.id] || {}, u = ultimo[d.id] || {};
                return (
                  <tr key={d.id} onClick={() => apriPersona(d.id)} style={{ cursor: "pointer", opacity: inForza(d) ? 1 : 0.55, outline: sel === d.id ? "2px solid var(--sic)" : undefined }}>
                    <td><b>{d.nome}</b>{!inForza(d) && <small>non più in forza</small>}</td>
                    <td><small style={{ color: "inherit" }}>{d.mansione}</small></td>
                    <td><small style={{ color: "inherit" }}>{d.contratto}</small></td>
                    {cella(d.finecontr)}
                    <td>{p.rischio ? p.rischio[0] + p.rischio.slice(1).toLowerCase() : ""}</td>
                    {cella(p.scadvis)}
                    {COL.map((k) => { const c = u[k]; return c ? cella(c.scadenza, c.scadenza ? fd(c.scadenza) : c.data ? "fatto " + fd(c.data) : c.note || "", k) : <td key={k}></td>; })}
                    <td><small style={{ color: "inherit" }}>{p.dpi}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <p className="tag">Nelle colonne dei corsi c&apos;è la scadenza dell&apos;ultimo corso fatto. Clic su una persona per vedere e aggiornare tutto.</p>
        </div>
      )}

      {tab === "corsi" && (
        <div className="box">
          <div className="row" style={{ marginBottom: 12 }}>
            <select value={ftipo} onChange={(e) => setFtipo(e.target.value)}><option value="">Tutti i corsi</option>{TIPI.map((t) => <option key={t.k} value={t.k}>{t.n}</option>)}</select>
            <label className="ck"><input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} /> Anche chi non è più in forza</label>
          </div>
          {edC && formCorso()}
          <div className="mx"><table>
            <thead><tr><th>Dipendente</th><th>Corso</th><th>Data</th><th>Scadenza</th><th>Note</th></tr></thead>
            <tbody>
              {corsi.filter((c) => (!ftipo || c.dati.tipo === ftipo) && byId[c.dati.dip] && (tutti || inForza(byId[c.dati.dip])))
                .sort((a, b) => (a.dati.scadenza || "9").localeCompare(b.dati.scadenza || "9"))
                .map((c) => (
                  <tr key={c.id} style={{ cursor: modifica ? "pointer" : undefined }} onClick={() => modifica && setEdC(JSON.parse(JSON.stringify(c)))}>
                    <td>{byId[c.dati.dip]?.nome}</td><td>{nomeTipo(c.dati.tipo)}</td><td>{fd(c.dati.data)}</td>
                    {cella(ultimo[c.dati.dip]?.[c.dati.tipo] === c.dati ? c.dati.scadenza : null, fd(c.dati.scadenza))}<td>{c.dati.note}</td>
                  </tr>
                ))}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "az" && (
        <div className="box">
          {edA && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 }}>
                <label style={{ ...lab, gridColumn: "span 2" }}>Cosa<input style={inp} value={edA.dati.nome || ""} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, nome: e.target.value } })} /></label>
                <label style={lab}>Ogni quanti mesi<input type="number" min={1} style={inp} value={edA.dati.mesi ?? ""} disabled={!modifica} onChange={(e) => { const mesi = Number(e.target.value) || undefined; setEdA({ ...edA, dati: { ...edA.dati, mesi, ...(mesi && edA.dati.ultimo ? { prossima: piuMesi(edA.dati.ultimo, mesi) } : {}) } }); }} /></label>
                <label style={lab}>Ultimo controllo<input type="date" style={inp} value={edA.dati.ultimo || ""} disabled={!modifica} onChange={(e) => { const ultimo = e.target.value; setEdA({ ...edA, dati: { ...edA.dati, ultimo, ...(ultimo && edA.dati.mesi ? { prossima: piuMesi(ultimo, edA.dati.mesi) } : {}) } }); }} /></label>
                <label style={lab}>Prossima scadenza<input type="date" style={inp} value={edA.dati.prossima || ""} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, prossima: e.target.value } })} /></label>
              </div>
              <label style={lab}>Note (chi se ne occupa, riferimenti)<input style={inp} value={edA.dati.note || ""} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, note: e.target.value } })} /></label>
              <div className="row">
                {modifica && edA.dati.mesi && <button className="btn sec" onClick={() => setEdA({ ...edA, dati: { ...edA.dati, ultimo: oggi(), prossima: piuMesi(oggi(), edA.dati.mesi || 0) } })}>Fatto oggi</button>}
                <span style={{ flex: 1 }} />
                {modifica && edA.id && <button className="btn danger" onClick={() => { if (confirm("Eliminare questa scadenza?")) { togli("azienda", edA.id, "Scadenza eliminata."); setEdA(null); } }}>Elimina</button>}
                <button className="btn sec" onClick={() => setEdA(null)}>{modifica ? "Annulla" : "Chiudi"}</button>
                {modifica && <button className="btn" onClick={async () => { if (!edA.dati.nome?.trim()) { setMsg({ t: "Scrivi cosa va controllato.", err: true }); return; } if (await scrivi("azienda", edA.id || uid(), edA.dati, "Scadenza salvata.")) setEdA(null); }}>Salva</button>}
              </div>
            </div>
          )}
          <div className="mx"><table>
            <thead><tr><th>Cosa</th><th>Frequenza</th><th>Ultimo controllo</th><th>Prossima scadenza</th><th>Note</th></tr></thead>
            <tbody>
              {az.map((a) => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => setEdA(JSON.parse(JSON.stringify(a)))}>
                  <td><b>{a.dati.nome}</b></td><td>{a.dati.mesi ? `ogni ${a.dati.mesi} mesi` : ""}</td><td>{fd(a.dati.ultimo)}</td>{cella(a.dati.prossima)}<td><small style={{ color: "inherit" }}>{a.dati.note}</small></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {modifica && !edA && <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={() => setEdA({ id: "", dati: { nome: "", mesi: 12 } })}>Nuova scadenza</button></div>}
        </div>
      )}

      {tab === "inf" && modifica && (
        <div className="box">
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="tag" style={{ margin: 0 }}>Registro infortuni: dati sanitari, visibile solo a chi può modificare la Sicurezza.</span>
            <label className="ck"><input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} /> Anche chi non è più in forza</label>
          </div>
          {edI && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 }}>
                <label style={lab}>Data<input type="date" style={inp} value={edI.dati.data || ""} onChange={(e) => setEdI({ ...edI, dati: { ...edI.dati, data: e.target.value } })} /></label>
                <label style={{ ...lab, gridColumn: "span 2" }}>Dipendente<select value={edI.dati.dip || ""} onChange={(e) => setEdI({ ...edI, dati: { ...edI.dati, dip: e.target.value, nome: byId[e.target.value]?.nome || edI.dati.nome } })}><option value="">{edI.dati.nome ? `${edI.dati.nome} (non in anagrafica)` : "—"}</option>{dip.filter((d) => inForza(d) || d.id === edI.dati.dip).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
                <label style={lab}>Luogo<input style={inp} value={edI.dati.luogo || ""} onChange={(e) => setEdI({ ...edI, dati: { ...edI.dati, luogo: e.target.value } })} /></label>
                <label style={lab}>Prima prognosi fino al<input type="date" style={inp} value={edI.dati.prog1 || ""} onChange={(e) => setEdI({ ...edI, dati: { ...edI.dati, prog1: e.target.value } })} /></label>
                <label style={lab}>Ultima prognosi fino al<input type="date" style={inp} value={edI.dati.prog2 || ""} onChange={(e) => setEdI({ ...edI, dati: { ...edI.dati, prog2: e.target.value } })} /></label>
                <label style={lab}>Giorni totali<input type="number" style={inp} value={edI.dati.giorni ?? ""} onChange={(e) => setEdI({ ...edI, dati: { ...edI.dati, giorni: Number(e.target.value) || undefined } })} /></label>
              </div>
              <label style={lab}>Cosa è successo<textarea rows={2} style={inp} value={edI.dati.desc || ""} onChange={(e) => setEdI({ ...edI, dati: { ...edI.dati, desc: e.target.value } })} /></label>
              <div className="row">
                <span style={{ flex: 1 }} />
                {edI.id && <button className="btn danger" onClick={() => { if (confirm("Eliminare questo infortunio dal registro?")) { togli("infortunio", edI.id, "Infortunio eliminato."); setEdI(null); } }}>Elimina</button>}
                <button className="btn sec" onClick={() => setEdI(null)}>Annulla</button>
                <button className="btn" onClick={async () => { if (!edI.dati.data) { setMsg({ t: "Indica la data dell'infortunio.", err: true }); return; } if (await scrivi("infortunio", edI.id || uid(), edI.dati, "Infortunio salvato.")) setEdI(null); }}>Salva</button>
              </div>
            </div>
          )}
          <div className="mx"><table>
            <thead><tr><th>Data</th><th>Dipendente</th><th>Luogo</th><th>Cosa è successo</th><th>Giorni</th></tr></thead>
            <tbody>
              {inf.filter((x) => tutti || (x.dati.dip && byId[x.dati.dip] && inForza(byId[x.dati.dip]))).map((x) => (
                <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => setEdI(JSON.parse(JSON.stringify(x)))}>
                  <td>{fd(x.dati.data)}</td><td>{byId[x.dati.dip || ""]?.nome || x.dati.nome}</td><td>{x.dati.luogo}</td><td>{x.dati.desc}</td><td>{x.dati.giorni}</td>
                </tr>
              ))}
              {!inf.filter((x) => tutti || (x.dati.dip && byId[x.dati.dip] && inForza(byId[x.dati.dip]))).length && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>Nessun infortunio registrato.</td></tr>}
            </tbody>
          </table></div>
          {!edI && <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={() => setEdI({ id: "", dati: { data: oggi() } })}>Nuovo infortunio</button></div>}
        </div>
      )}
    </>
  );

  function formCorso() {
    if (!edC) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, border: "1px solid var(--line)", borderRadius: 8, margin: "8px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 }}>
          <label style={lab}>Dipendente<select value={edC.dati.dip} onChange={(e) => setC("dip", e.target.value)}>{dip.filter((d) => inForza(d) || d.id === edC.dati.dip).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
          <label style={lab}>Corso<select value={edC.dati.tipo} onChange={(e) => setC("tipo", e.target.value)}>{TIPI.map((t) => <option key={t.k} value={t.k}>{t.n}</option>)}</select></label>
          <label style={lab}>Data<input type="date" style={inp} value={edC.dati.data || ""} onChange={(e) => setC("data", e.target.value)} /></label>
          <label style={lab}>Scadenza<input type="date" style={inp} value={edC.dati.scadenza || ""} onChange={(e) => setC("scadenza", e.target.value)} /></label>
          <label style={lab}>Ore<input style={inp} value={edC.dati.ore || ""} onChange={(e) => setC("ore", e.target.value)} /></label>
        </div>
        <label style={lab}>Note (ente, attestato, «da fare»…)<input style={inp} value={edC.dati.note || ""} onChange={(e) => setC("note", e.target.value)} /></label>
        <div className="row">
          <span className="tag" style={{ margin: 0 }}>La scadenza si calcola dalla data: {TIPI.find((t) => t.k === edC.dati.tipo)?.anni || "nessuna"}{TIPI.find((t) => t.k === edC.dati.tipo)?.anni ? " anni" : ""}. Si può cambiare.</span>
          <span style={{ flex: 1 }} />
          {edC.id && <button className="btn danger" onClick={() => { if (confirm("Eliminare questo corso?")) { togli("corso", edC.id, "Corso eliminato."); setEdC(null); } }}>Elimina</button>}
          <button className="btn sec" onClick={() => setEdC(null)}>Annulla</button>
          <button className="btn" onClick={async () => { if (!edC.dati.data && !edC.dati.note) { setMsg({ t: "Indica la data del corso (o una nota, per esempio «da fare»).", err: true }); return; } if (await scrivi("corso", edC.id || uid(), edC.dati, "Corso salvato.")) setEdC(null); }}>Salva</button>
        </div>
      </div>
    );
  }
}
