"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Le persone arrivano dall'Anagrafica dipendenti (funzione sic_dipendenti): qui non si inseriscono.
type Dip = { id: string; nome: string; mansione: string | null; reparto: string | null; contratto: string | null; attivo: boolean; assunzione: string | null; fine: string | null; finecontr?: string | null };
type Persona = { rischio?: string; gen?: string; dpi?: string; addestr?: string; preass?: string; period?: string; ultvis?: string; scadvis?: string; note?: string };
type Corso = { dip: string; tipo: string; data?: string; scadenza?: string; ore?: string; note?: string; chiuso?: boolean };
type Azienda = { nome: string; mesi?: number; ultimo?: string; prossima?: string; note?: string; incaricato?: string; procedura?: string; controlli?: string[] };
type Voce = { voce: string; ok: boolean; nota?: string };
type Foto = { path: string; nome?: string };
type Verifica = { az: string; data: string; chi?: string; esito?: string; note?: string; firma?: string; foto?: Foto[]; controlli?: Voce[] };
type Sanitari = { idoneo?: string; prescr?: string };
type Incarico = { ruolo: string; dip?: string; esterno?: string; dal?: string; note?: string };
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
  { k: "prep", n: "Preposto", anni: 2 },
  { k: "dirs", n: "Dirigente per la sicurezza", anni: 5 },
  { k: "rspp", n: "RSPP / ASPP", anni: 5 },
  { k: "altro", n: "Altro corso", anni: 0 },
];
// Incarichi della sicurezza e corso che li abilita (per controllare che sia valido)
const RUOLI: { k: string; n: string; corso?: string; esterno?: boolean }[] = [
  { k: "dl", n: "Datore di lavoro" },
  { k: "rspp", n: "RSPP", corso: "rspp", esterno: true },
  { k: "mc", n: "Medico competente", esterno: true },
  { k: "rls", n: "RLS", corso: "rls" },
  { k: "dirs", n: "Dirigente per la sicurezza", corso: "dirs" },
  { k: "prep", n: "Preposto", corso: "prep" },
  { k: "ps", n: "Addetto primo soccorso", corso: "ps" },
  { k: "ai", n: "Addetto antincendio", corso: "ai" },
  { k: "car", n: "Carrellista", corso: "car" },
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
const scadContr = (d: Dip) => d.finecontr || (d.fine && d.fine >= oggi() ? d.fine : null);
const inForza = (d: Dip) => d.attivo && !(d.fine && d.fine < oggi());
const norm = (s?: string | null) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
const inp: React.CSSProperties = { padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)", font: "inherit" };
const lab: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };

export default function Sicurezza({ modifica, gestisce = false }: { modifica: boolean; gestisce?: boolean }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [tab, setTab] = useState("scad");
  const [dip, setDip] = useState<Dip[]>([]);
  const [pers, setPers] = useState<Record<string, Persona>>({});
  const [corsi, setCorsi] = useState<Doc<Corso>[]>([]);
  const [az, setAz] = useState<Doc<Azienda>[]>([]);
  const [san, setSan] = useState<Record<string, Sanitari>>({});
  const [inf, setInf] = useState<Doc<Infortunio>[]>([]);
  const [inc, setInc] = useState<Doc<Incarico>[]>([]);
  const [edN, setEdN] = useState<Doc<Incarico> | null>(null);
  const [carico, setCarico] = useState(true);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [tutti, setTutti] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [edP, setEdP] = useState<Persona>({});
  const [edS, setEdS] = useState<Sanitari>({});
  const [edC, setEdC] = useState<Doc<Corso> | null>(null);
  const [edA, setEdA] = useState<Doc<Azienda> | null>(null);
  const [ver, setVer] = useState<Doc<Verifica>[]>([]);
  const [edV, setEdV] = useState<Verifica | null>(null);
  const [fotoNuove, setFotoNuove] = useState<File[]>([]);
  const [firmato, setFirmato] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const firmaRef = useRef<HTMLCanvasElement | null>(null);
  const [url, setUrl] = useState<Record<string, string>>({});
  const [edI, setEdI] = useState<Doc<Infortunio> | null>(null);
  const [ftipo, setFtipo] = useState("");
  const [storico, setStorico] = useState(false);
  const [annoI, setAnnoI] = useState("");
  const dettRef = useRef<HTMLDivElement | null>(null);

  async function carica() {
    const [d, s] = await Promise.all([sb.rpc("sic_dipendenti"), sb.from("sic_docs").select("coll,id,dati")]);
    if (d.error || s.error) setMsg({ t: "Errore nel caricamento: " + (d.error || s.error)?.message, err: true });
    setDip((d.data ?? []) as Dip[]);
    const V: Doc<Verifica>[] = [], N: Doc<Incarico>[] = [], P: Record<string, Persona> = {}, S: Record<string, Sanitari> = {}, C: Doc<Corso>[] = [], A: Doc<Azienda>[] = [], I: Doc<Infortunio>[] = [];
    ((s.data ?? []) as { coll: string; id: string; dati: never }[]).forEach((x) => {
      if (x.coll === "persona") P[x.id] = x.dati; else if (x.coll === "sanitari") S[x.id] = x.dati;
      else if (x.coll === "corso") {
        // corso senza scadenza scritta: la si calcola dalla data con la validità del tipo
        const c = x.dati as Corso, anni = TIPI.find((t) => t.k === c.tipo)?.anni || 0;
        C.push(!c.scadenza && c.data && anni ? { ...x, dati: { ...c, scadenza: piuMesi(c.data, 12 * anni) } } : x);
      } else if (x.coll === "azienda") A.push(x); else if (x.coll === "infortunio") I.push(x); else if (x.coll === "incarico") N.push(x); else if (x.coll === "verifica") V.push(x);
    });
    setVer(V.sort((a, b) => b.dati.data.localeCompare(a.dati.data))); setInc(N); setPers(P); setSan(S); setCorsi(C); setInf(I.sort((a, b) => (b.dati.data || "").localeCompare(a.dati.data || "")));
    setEdA((e) => (e?.id ? A.find((x) => x.id === e.id) ?? e : e));
    setAz(A.sort((a, b) => (a.dati.prossima || "9").localeCompare(b.dati.prossima || "9")));
    setCarico(false);
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!edA?.id) return;
    const paths = ver.filter((v) => v.dati.az === edA.id).flatMap((v) => [v.dati.firma, ...(v.dati.foto || []).map((f) => f.path)]).filter((x): x is string => !!x && !url[x]);
    if (!paths.length) return;
    sb.storage.from("sicurezza").createSignedUrls(paths, 3600).then(({ data }) => {
      const m: Record<string, string> = {};
      (data || []).forEach((x) => { if (x.signedUrl && x.path) m[x.path] = x.signedUrl; });
      setUrl((u) => ({ ...u, ...m }));
    });
  }, [edA?.id, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvaVerifica(a: Doc<Azienda>) {
    if (!edV) return;
    if (!edV.chi) { setMsg({ t: "Indica chi ha fatto la verifica.", err: true }); return; }
    if (!firmato || !firmaRef.current) { setMsg({ t: "Manca la firma di chi ha verificato.", err: true }); return; }
    setSalvo(true);
    try {
      const id = uid(), base = `verifiche/${id}`;
      const png = await new Promise<Blob>((ok, ko) => firmaRef.current!.toBlob((b) => (b ? ok(b) : ko(new Error("firma"))), "image/png"));
      const up = await sb.storage.from("sicurezza").upload(`${base}/firma.png`, png, { contentType: "image/png" });
      if (up.error) throw up.error;
      const foto: Foto[] = [];
      for (let i = 0; i < fotoNuove.length; i++) {
        const f = fotoNuove[i], jpg = await rimpicciolisci(f), path = `${base}/foto-${i + 1}.jpg`;
        const u = await sb.storage.from("sicurezza").upload(path, jpg, { contentType: "image/jpeg" });
        if (u.error) throw u.error;
        foto.push({ path, nome: f.name });
      }
      const dati = Object.fromEntries(Object.entries({ ...edV, firma: `${base}/firma.png`, foto: foto.length ? foto : undefined }).filter(([, v]) => v !== "" && v != null));
      const { error } = await sb.rpc("sic_registra_verifica", { p_id: id, p_az: a.id, p_dati: dati });
      if (error) throw error;
      setMsg({ t: "Verifica registrata e firmata." });
      setEdV(null); setFotoNuove([]); setFirmato(false);
      await carica();
      setEdA((x) => x);
    } catch (e) {
      setMsg({ t: "Verifica non registrata: " + (e as Error).message, err: true });
    } finally { setSalvo(false); }
  }

  // PDF di una o più verifiche di una scadenza aziendale (firma e foto incluse)
  async function scaricaVerifiche(a: Doc<Azienda>, lista: Doc<Verifica>[]) {
    setMsg({ t: "Preparo il PDF…" });
    try {
      const comeUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });
      const scarica = async (path?: string) => { if (!path) return undefined; const { data } = await sb.storage.from("sicurezza").download(path); return data ? comeUrl(data) : undefined; };
      const [{ jsPDF }, { pdfVerifiche }, logo] = await Promise.all([import("jspdf"), import("./sicurezzaPdf"), fetch("/logo/kimatic").then((r) => r.blob()).then(comeUrl).catch(() => undefined)]);
      const righe = await Promise.all(lista.slice().sort((x, y) => x.dati.data.localeCompare(y.dati.data)).map(async ({ dati: v }) => ({
        data: v.data, chi: byId[v.chi || ""]?.nome || "", esito: v.esito, note: v.note, controlli: v.controlli,
        firma: await scarica(v.firma), foto: (await Promise.all((v.foto || []).map((f) => scarica(f.path)))).filter((x): x is string => !!x),
      })));
      const freq = a.dati.mesi ? (a.dati.mesi === 1 ? "ogni mese" : `ogni ${a.dati.mesi} mesi`) : "";
      const doc = pdfVerifiche(jsPDF, { nome: a.dati.nome, frequenza: freq }, righe, logo);
      const nome = a.dati.nome.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
      doc.save(lista.length === 1 ? `Verifica_${nome}_${lista[0].dati.data}.pdf` : `Registro_verifiche_${nome}.pdf`);
      setMsg(null);
    } catch (e) { setMsg({ t: "PDF non creato: " + (e as Error).message, err: true }); }
  }

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
    if (!d.finecontr && d.fine) righe.push({ quando: d.fine, cosa: "Fine rapporto", chi: d.nome, dip: d.id });
    if (d.finecontr) righe.push({ quando: d.finecontr, cosa: "Scadenza contratto" + (d.contratto ? ` (${d.contratto.toLowerCase()})` : ""), chi: d.nome, dip: d.id });
    if (p.scadvis) righe.push({ quando: p.scadvis, cosa: "Visita medica" + (p.period ? ` (${p.period.toLowerCase()})` : ""), chi: d.nome, dip: d.id });
    Object.values(ultimo[d.id] || {}).forEach((c) => { if (c.scadenza && !c.chiuso) righe.push({ quando: c.scadenza, cosa: nomeTipo(c.tipo), chi: d.nome, dip: d.id }); });
  });
  inc.forEach((x) => {
    const r = RUOLI.find((y) => y.k === x.dati.ruolo), d = x.dati.dip ? byId[x.dati.dip] : null;
    if (!r?.corso || !d || !inForza(d) || ultimo[d.id]?.[r.corso]) return;
    righe.push({ quando: oggi(), cosa: `${r.n}: manca il corso`, chi: d.nome, dip: d.id });
  });
  az.forEach((a) => { if (a.dati.prossima) righe.push({ quando: a.dati.prossima, cosa: a.dati.nome, chi: "Azienda", az: a.id }); });
  righe.sort((a, b) => a.quando.localeCompare(b.quando));
  const scadute = righe.filter((r) => stato(r.quando) === "scad"), presto = righe.filter((r) => stato(r.quando) === "presto");
  const daFare = attivi.flatMap((d) => Object.values(ultimo[d.id] || {}).filter((c) => !c.data && !c.scadenza && c.note).map((c) => ({ d, c })));

  function apriPersona(id: string) {
    setSel(id); setEdP({ ...(pers[id] || {}) }); setEdS({ ...(san[id] || {}) }); setEdC(null); setMsg(null);
    setTimeout(() => dettRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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
  const tabs: [string, string][] = [["scad", `Scadenze${scadute.length ? ` (${scadute.length} scadute)` : ""}`], ["dip", "Dipendenti"], ["add", "Addetti"], ["corsi", "Corsi"], ["az", "Scadenze aziendali"], ...(modifica ? [["inf", "Infortuni"] as [string, string]] : [])];

  // Backup Excel di tutta la Sicurezza (modello «Elenco dipendenti in forza»)
  async function scaricaBackup() {
    setMsg({ t: "Preparo il backup…" });
    try {
      // dati anagrafici completi: li legge solo chi può vedere l'Anagrafica dipendenti (Direzione)
      type Ana = { nascita?: string; luogo?: string; sesso?: string; cf?: string };
      const ana: Record<string, Ana> = {};
      const { data: an } = await sb.from("dipendenti").select("id,dati");
      (an || []).forEach((x: { id: string; dati: Ana }) => { ana[x.id] = x.dati; });
      const D = (s?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : s || null; };
      const col = (s?: string | null) => { const x = stato(s); return x || undefined; };
      const ordinati = dip.slice().sort((a, b) => Number(inForza(b)) - Number(inForza(a)) || a.nome.localeCompare(b.nome, "it"));
      const nomeDi = (id?: string) => byId[id || ""]?.nome || "";
      const fogli: import("./sicurezzaBackup").Foglio[] = [];

      fogli.push({
        nome: "DIPENDENTI KIMATIC", blocca: 1,
        titolo: ["ELENCO DIPENDENTI CON RELATIVE MANSIONI – focus SICUREZZA", "AZIENDA: KIMATIC SRL – Via Matteotti 26, Loc. Cadriano, Granarolo dell'Emilia (BO)", `Aggiornato al ${fd(oggi())} · scaricato dal Gestionale Kimatic`],
        gruppi: [["VISITE CON MEDICO DEL LAVORO", 10, 15], ["CORSI SICUREZZA", 19, 22], ["CORSI CARRELLISTI", 23, 24], ["PRIMO SOCCORSO", 25, 26], ["CORSO ANTINCENDIO", 27, 28], ["RLS", 29, 30], ["CORSO PES-PAV-PEI", 31, 32]],
        intestazioni: [["COGNOME e NOME", 30], ["MANSIONE", 24], ["DATA DI NASCITA", 12], ["LUOGO DI NASCITA", 16], ["SESSO", 7], ["CODICE FISCALE", 19], ["DATA ASSUNZIONE", 12], ["Modulo consegna DPI", 14], ["Modulo addestramento", 14],
          ["DATA VISITA PREASSUNTIVA", 13], ["IDONEO", 8], ["CON PRESCRIZIONE", 18], ["Periodicità visita", 12], ["ULTIMA VISITA", 12], ["SCADENZA VISITA", 12],
          ["IN FORZA", 8], ["ULTIMO GIORNO DI LAVORO", 13], ["SCADENZA CONTRATTO", 13],
          ["FORMAZIONE GENERALE", 11], ["RISCHIO (basso 4h / alto 12h)", 12], ["Ultimo corso sicurezza", 12], ["Scadenza (6 h ogni 5 anni)", 12],
          ["Ultimo corso carrellisti", 12], ["Scadenza (4 h ogni 5 anni)", 12], ["Ultimo corso (classe A 16h)", 12], ["Scadenza (6 h ogni 3 anni)", 12],
          ["Ultimo corso (8 h medio)", 12], ["Scadenza (5 h ogni 5 anni)", 12], ["Ultimo corso (32h il primo)", 12], ["Scadenza (4 h ogni anno)", 12], ["Ultimo corso", 12], ["Scadenza", 12]],
        righe: ordinati.map((d) => {
          const p = pers[d.id] || {}, a = ana[d.id] || {}, sa = san[d.id] || {}, u = ultimo[d.id] || {};
          const corso = (k: string): Cella[] => { const c = u[k]; return c ? [D(c.data) ?? (c.note || null), c.chiuso ? "non rinnovato" : D(c.scadenza)] : [null, null]; };
          const v: Cella[] = [d.nome, d.mansione, D(a.nascita), a.luogo, a.sesso, a.cf, D(d.assunzione), p.dpi, p.addestr,
            D(p.preass), sa.idoneo, sa.prescr || (modifica && sa.idoneo ? "NO" : ""), p.period, D(p.ultvis), D(p.scadvis),
            inForza(d) ? "SI" : "NO", D(d.fine), D(d.finecontr),
            p.gen, p.rischio, ...corso("sic"), ...corso("car"), ...corso("ps"), ...corso("ai"), ...corso("rls"), ...corso("pes")];
          const colori: Record<number, "scad" | "presto" | "ok"> = {};
          if (inForza(d)) {
            const set = (i: number, s?: string | null) => { const c = col(s); if (c) colori[i] = c; };
            set(14, p.scadvis); set(17, d.finecontr);
            ["sic", "car", "ps", "ai", "rls", "pes"].forEach((k, j) => { const c = u[k]; if (c && !c.chiuso) set(21 + j * 2, c.scadenza); });
          }
          return { v, colori, grigia: !inForza(d) };
        }),
      });
      type Cella = string | number | Date | null | undefined;

      fogli.push({
        nome: "STORICO CORSI",
        intestazioni: [["Dipendente", 30], ["In forza", 8], ["Corso", 34], ["Data", 12], ["Scadenza", 12], ["Ore", 7], ["Ultimo di quel tipo", 10], ["Non rinnovato", 10], ["Note", 40]],
        righe: corsi.filter((c) => byId[c.dati.dip]).sort((a, b) => nomeDi(a.dati.dip).localeCompare(nomeDi(b.dati.dip), "it") || a.dati.tipo.localeCompare(b.dati.tipo) || (b.dati.data || "").localeCompare(a.dati.data || ""))
          .map(({ dati: c }) => { const ult = ultimo[c.dip]?.[c.tipo] === c, fz = inForza(byId[c.dip]); return { v: [nomeDi(c.dip), fz ? "SI" : "NO", nomeTipo(c.tipo), D(c.data), D(c.scadenza), c.ore, ult ? "SI" : "", c.chiuso ? "SI" : "", c.note], grigia: !ult || !fz, colori: ult && fz && !c.chiuso && col(c.scadenza) ? { 4: col(c.scadenza)! } : undefined }; }),
      });

      fogli.push({
        nome: "ADDETTI",
        intestazioni: [["Incarico", 28], ["Nominativo", 30], ["Nominato il", 12], ["Corso del", 12], ["Corso valido fino al", 14], ["Note", 40]],
        righe: RUOLI.flatMap((r) => inc.filter((x) => x.dati.ruolo === r.k && (!x.dati.dip || (byId[x.dati.dip] && inForza(byId[x.dati.dip])))).map(({ dati: x }) => {
          const c = x.dip && r.corso ? ultimo[x.dip]?.[r.corso] : undefined;
          return { v: [r.n, x.dip ? nomeDi(x.dip) : x.esterno, D(x.dal), D(c?.data), r.corso && x.dip ? (c ? D(c.scadenza) : "corso mancante") : null, x.note], colori: c?.scadenza && col(c.scadenza) ? { 4: col(c.scadenza)! } : undefined };
        })),
      });

      fogli.push({
        nome: "SCADENZE AZIENDALI",
        intestazioni: [["Cosa", 44], ["Frequenza", 12], ["Incaricato", 26], ["Ultimo controllo", 13], ["Prossima scadenza", 13], ["Verifiche registrate", 11], ["Note", 40]],
        righe: az.map(({ id, dati: a }) => ({ v: [a.nome, a.mesi ? (a.mesi === 1 ? "ogni mese" : `ogni ${a.mesi} mesi`) : "", nomeDi(a.incaricato), D(a.ultimo), D(a.prossima), ver.filter((v) => v.dati.az === id).length, a.note], colori: col(a.prossima) ? { 4: col(a.prossima)! } : undefined })),
      });

      fogli.push({
        nome: "REGISTRO VERIFICHE",
        intestazioni: [["Scadenza aziendale", 40], ["Data", 12], ["Eseguita da", 26], ["Esito", 13], ["Controlli OK", 11], ["Da sistemare", 60], ["Note", 40], ["Firma", 8], ["Foto", 6]],
        righe: ver.slice().sort((a, b) => a.dati.data.localeCompare(b.dati.data)).map(({ dati: v }) => ({
          v: [az.find((a) => a.id === v.az)?.dati.nome || "(scadenza eliminata)", D(v.data), nomeDi(v.chi), v.esito, v.controlli ? `${v.controlli.filter((c) => c.ok).length}/${v.controlli.length}` : "", (v.controlli || []).filter((c) => !c.ok).map((c) => c.voce + (c.nota ? ": " + c.nota : "")).join("; "), v.note, v.firma ? "SI" : "", (v.foto || []).length || null],
          colori: v.esito === "Non conforme" ? { 3: "scad" as const } : undefined,
        })),
      });

      if (modifica) fogli.push({
        nome: "INFORTUNI",
        intestazioni: [["Data infortunio", 12], ["Dipendente", 30], ["Luogo", 24], ["Cosa è successo", 50], ["1° prognosi", 12], ["Ultima prognosi", 12], ["Giorni tot", 9]],
        righe: inf.slice().sort((a, b) => (a.dati.data || "").localeCompare(b.dati.data || "")).map(({ dati: x }) => ({ v: [D(x.data), nomeDi(x.dip) || x.nome, x.luogo, x.desc, D(x.prog1), D(x.prog2), durata(x) || null] })),
      });

      const [ExcelJS, { creaBackup }] = await Promise.all([import("exceljs").then((m) => m.default), import("./sicurezzaBackup")]);
      const buf = await creaBackup(ExcelJS, fogli);
      const el = document.createElement("a");
      el.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      el.download = `Sicurezza_backup_${oggi()}.xlsx`; el.click();
      setTimeout(() => URL.revokeObjectURL(el.href), 5000);
      setMsg({ t: `Backup scaricato${an?.length ? "" : " (senza data di nascita e codice fiscale: li vede solo la Direzione)"}.` });
    } catch (e) { setMsg({ t: "Backup non creato: " + (e as Error).message, err: true }); }
  }

  const durata = (x: Infortunio) => x.giorni ?? (x.data && (x.prog2 || x.prog1) ? Math.max(0, Math.round((new Date((x.prog2 || x.prog1) + "T12:00:00").getTime() - new Date(x.data + "T12:00:00").getTime()) / 864e5) + 1) : 0);
  const anniI = Object.values(inf.reduce((m, x) => {
    const anno = (x.dati.data || "").slice(0, 4) || "senza data";
    const a = (m[anno] ??= { anno, n: 0, gg: 0, pers: 0, chi: new Set<string>() });
    a.n++; a.gg += durata(x.dati) || 0; a.chi.add(x.dati.dip || x.dati.nome || x.id); a.pers = a.chi.size;
    return m;
  }, {} as Record<string, { anno: string; n: number; gg: number; pers: number; chi: Set<string> }>)).sort((a, b) => b.anno.localeCompare(a.anno));
  const infVis = inf.filter((x) => (annoI ? (x.dati.data || "").startsWith(annoI) || (annoI === "senza data" && !x.dati.data) : tutti || (x.dati.dip && byId[x.dati.dip] && inForza(byId[x.dati.dip]))));

  async function esportaInfortuni() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Infortuni");
    ws.columns = [{ header: "Data", width: 12 }, { header: "Anno", width: 7 }, { header: "Dipendente", width: 30 }, { header: "Luogo", width: 24 }, { header: "Cosa è successo", width: 60 }, { header: "Prima prognosi fino al", width: 14 }, { header: "Ultima prognosi fino al", width: 14 }, { header: "Giorni", width: 8 }];
    ws.getRow(1).font = { bold: true };
    infVis.slice().sort((a, b) => (a.dati.data || "").localeCompare(b.dati.data || "")).forEach(({ dati: x }) => ws.addRow([fd(x.data), (x.data || "").slice(0, 4), byId[x.dip || ""]?.nome || x.nome || "", x.luogo || "", x.desc || "", fd(x.prog1), fd(x.prog2), durata(x) || null]));
    const r = wb.addWorksheet("Per anno");
    r.columns = [{ header: "Anno", width: 10 }, { header: "Infortuni", width: 10 }, { header: "Giorni di assenza", width: 16 }, { header: "Persone coinvolte", width: 16 }];
    r.getRow(1).font = { bold: true };
    anniI.forEach((a) => r.addRow([a.anno, a.n, a.gg, a.pers]));
    const buf = await wb.xlsx.writeBuffer();
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    el.download = `Infortuni${annoI ? "_" + annoI : ""}_${oggi()}.xlsx`; el.click();
    setTimeout(() => URL.revokeObjectURL(el.href), 5000);
  }

  // Elenco degli addetti da consegnare alle aziende esterne che lo chiedono (DUVRI, appalti)
  function stampaAddetti() {
    const h = (x: unknown) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const righe = RUOLI.filter((r) => r.k !== "car").map((r) => {
      const lista = inc.filter((x) => x.dati.ruolo === r.k && (!x.dati.dip || (byId[x.dati.dip] && inForza(byId[x.dati.dip]))));
      const nomi = lista.map((x) => {
        const c = x.dati.dip && r.corso ? ultimo[x.dati.dip]?.[r.corso] : undefined;
        const nome = x.dati.dip ? byId[x.dati.dip]?.nome : x.dati.esterno;
        const form = r.corso && x.dati.dip ? (c?.data ? `formazione del ${fd(c.data)}${c.scadenza ? `, valida fino al ${fd(c.scadenza)}` : ""}` : "") : x.dati.esterno ? "incarico esterno" : "";
        return `<div class="p"><b>${h(nome)}</b>${form ? `<span>${h(form)}</span>` : ""}</div>`;
      }).join("");
      return lista.length ? `<tr><th>${h(r.n)}</th><td>${nomi}</td></tr>` : "";
    }).join("");
    const w = window.open("", "_blank");
    if (!w) { setMsg({ t: "Il browser ha bloccato la finestra di stampa: consenti i popup per il gestionale.", err: true }); return; }
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Organigramma della sicurezza - Kimatic Srl</title><style>
      @page{size:A4;margin:16mm}body{font:11pt/1.4 Arial,Helvetica,sans-serif;color:#1b1b1b;margin:0}
      header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #c2410c;padding-bottom:10px;margin-bottom:18px}
      header img{height:46px}h1{font-size:17pt;margin:0;text-align:right}h1 small{display:block;font-size:10pt;font-weight:normal;color:#555}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px 10px;vertical-align:top;text-align:left}
      th{width:34%;background:#fbeee6;font-size:10.5pt}.p{padding:2px 0}.p span{display:block;font-size:9pt;color:#555}
      footer{margin-top:22px;font-size:8.5pt;color:#666;border-top:1px solid #ccc;padding-top:8px}
      .no{margin:0 0 14px}@media print{.no{display:none}}
    </style></head><body>
      <div class="no"><button onclick="print()">Stampa / salva PDF</button></div>
      <header><img src="${location.origin}/logo/kimatic" alt="Kimatic"><h1>Organigramma della sicurezza<small>Figure e addetti ai sensi del D.Lgs. 81/2008 · aggiornato al ${fd(oggi())}</small></h1></header>
      <table>${righe}</table>
      <footer>Kimatic S.r.l. · Via G. Matteotti 26, 40057 Cadriano di Granarolo dell'Emilia (BO) · P.IVA 03286631209</footer>
      <script>window.onload=function(){setTimeout(function(){print()},300)}</script>
    </body></html>`);
    w.document.close();
  }

  if (carico) return <div className="empty">Caricamento…</div>;
  const ds = sel ? byId[sel] : null;
  const vis = dip.filter((d) => (tutti || inForza(d)) && (!q || norm(`${d.nome} ${d.mansione} ${d.reparto}`).includes(norm(q))));

  return (
    <>
      <header>{modifica && <button className="btn sec" style={{ float: "right" }} onClick={scaricaBackup}>Scarica backup Excel</button>}<h1>Sicurezza e formazione</h1><p className="sub">Corsi, visite mediche, DPI e scadenze. Le persone arrivano dall&apos;Anagrafica dipendenti: nuovi assunti e uscite si registrano lì.</p></header>
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
        <div ref={dettRef} className="box" style={{ display: "flex", flexDirection: "column", gap: 12, borderLeft: "6px solid var(--sic)", scrollMarginTop: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", margin: "-4px -4px 0", padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb,var(--sic) 16%,var(--surface))" }}>
            <h2 style={{ margin: 0, fontSize: 26, letterSpacing: 0.3, color: "var(--sic)" }}>{ds.nome}</h2>
            <span className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className="tag" style={{ margin: 0 }}>{[ds.reparto, ds.assunzione && "assunto il " + fd(ds.assunzione), ds.fine && ds.fine < oggi() && "uscito il " + fd(ds.fine)].filter(Boolean).join(" · ")}</span>
              {scadContr(ds) && <span style={{ padding: "4px 10px", borderRadius: 6, fontWeight: 600, background: SFONDO[stato(scadContr(ds))] }}>Scadenza contratto {fd(scadContr(ds))}</span>}
            </span>
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
                  <td>{nomeTipo(c.dati.tipo)}</td><td>{fd(c.dati.data)}</td>{cella(ultimo[ds.id]?.[c.dati.tipo] === c.dati && !c.dati.chiuso ? c.dati.scadenza : null, c.dati.chiuso ? "non rinnovato" : fd(c.dati.scadenza))}<td>{c.dati.ore}</td><td>{c.dati.note}</td>
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
            <input type="text" placeholder="Cerca nome o reparto…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
            <label className="ck"><input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} /> Mostra anche chi non è più in forza</label>
            <span className="tag" style={{ margin: 0 }}>{attivi.length} in forza</span>
          </div>
          <div className="mx"><table>
            <thead><tr><th>Nome</th><th>Scad. contratto</th><th>Rischio</th><th>Visita</th>{COL.map((k) => <th key={k}>{BREVE[k]}</th>)}<th>DPI</th></tr></thead>
            <tbody>
              {vis.map((d) => {
                const p = pers[d.id] || {}, u = ultimo[d.id] || {};
                return (
                  <tr key={d.id} onClick={() => apriPersona(d.id)} style={{ cursor: "pointer", opacity: inForza(d) ? 1 : 0.55, outline: sel === d.id ? "3px solid var(--sic)" : undefined }}>
                    <td style={sel === d.id ? { background: "var(--sic)", color: "#fff" } : undefined}><b style={sel === d.id ? { fontSize: 15 } : undefined}>{sel === d.id ? "▶ " : ""}{d.nome}</b>{!inForza(d) && <small>non più in forza</small>}</td>
                    {cella(scadContr(d))}
                    <td>{p.rischio ? p.rischio[0] + p.rischio.slice(1).toLowerCase() : ""}</td>
                    {cella(p.scadvis)}
                    {COL.map((k) => { const c = u[k]; return c?.chiuso ? <td key={k}><small title={c.note}>non rinnovato</small></td> : c ? cella(c.scadenza, c.scadenza ? fd(c.scadenza) : c.data ? "fatto " + fd(c.data) : c.note || "", k) : <td key={k}></td>; })}
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
            <label className="ck"><input type="checkbox" checked={storico} onChange={(e) => setStorico(e.target.checked)} /> Mostra lo storico (corsi precedenti)</label>
          </div>
          {edC && formCorso()}
          <div className="mx"><table>
            <thead><tr><th>Dipendente</th><th>Corso</th><th>Data</th><th>Scadenza</th><th>Note</th></tr></thead>
            <tbody>
              {corsi.filter((c) => (!ftipo || c.dati.tipo === ftipo) && byId[c.dati.dip] && (tutti || inForza(byId[c.dati.dip])) && (storico || ultimo[c.dati.dip]?.[c.dati.tipo] === c.dati))
                .sort((a, b) => (a.dati.scadenza || "9").localeCompare(b.dati.scadenza || "9"))
                .map((c) => (
                  <tr key={c.id} style={{ cursor: modifica ? "pointer" : undefined }} onClick={() => modifica && setEdC(JSON.parse(JSON.stringify(c)))}>
                    <td>{byId[c.dati.dip]?.nome}</td><td>{nomeTipo(c.dati.tipo)}{ultimo[c.dati.dip]?.[c.dati.tipo] !== c.dati && <small> (storico)</small>}</td><td>{fd(c.dati.data)}</td>
                    {cella(ultimo[c.dati.dip]?.[c.dati.tipo] === c.dati && !c.dati.chiuso ? c.dati.scadenza : null, c.dati.chiuso ? "non rinnovato" : fd(c.dati.scadenza))}<td>{c.dati.note}</td>
                  </tr>
                ))}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "add" && (
        <div className="box">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <p className="tag" style={{ margin: 0 }}>Chi ricopre gli incarichi della sicurezza. Accanto a ognuno c&apos;è la scadenza del corso che lo abilita: rossa se scaduto o mancante.</p>
            <button className="btn" onClick={stampaAddetti}>Stampa per aziende esterne</button>
          </div>
          {edN && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, border: "1px solid var(--line)", borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
                <label style={lab}>Incarico<select value={edN.dati.ruolo} onChange={(e) => setEdN({ ...edN, dati: { ...edN.dati, ruolo: e.target.value } })}>{RUOLI.map((r) => <option key={r.k} value={r.k}>{r.n}</option>)}</select></label>
                <label style={lab}>Dipendente<select value={edN.dati.dip || ""} onChange={(e) => setEdN({ ...edN, dati: { ...edN.dati, dip: e.target.value || undefined } })}><option value="">— esterno —</option>{dip.filter((d) => inForza(d) || d.id === edN.dati.dip).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
                {!edN.dati.dip && <label style={lab}>Nome (se esterno)<input style={inp} value={edN.dati.esterno || ""} onChange={(e) => setEdN({ ...edN, dati: { ...edN.dati, esterno: e.target.value } })} /></label>}
                <label style={lab}>Nominato il<input type="date" style={inp} value={edN.dati.dal || ""} onChange={(e) => setEdN({ ...edN, dati: { ...edN.dati, dal: e.target.value } })} /></label>
              </div>
              <label style={lab}>Note<input style={inp} value={edN.dati.note || ""} onChange={(e) => setEdN({ ...edN, dati: { ...edN.dati, note: e.target.value } })} /></label>
              <div className="row">
                <span style={{ flex: 1 }} />
                {edN.id && <button className="btn danger" onClick={() => { if (confirm("Togliere questo incarico?")) { togli("incarico", edN.id, "Incarico tolto."); setEdN(null); } }}>Togli incarico</button>}
                <button className="btn sec" onClick={() => setEdN(null)}>Annulla</button>
                <button className="btn" onClick={async () => { if (!edN.dati.dip && !edN.dati.esterno?.trim()) { setMsg({ t: "Scegli il dipendente o scrivi il nome dell'esterno.", err: true }); return; } if (await scrivi("incarico", edN.id || uid(), edN.dati, "Incarico salvato.")) setEdN(null); }}>Salva</button>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
            {RUOLI.map((r) => {
              const lista = inc.filter((x) => x.dati.ruolo === r.k && (!x.dati.dip || (byId[x.dati.dip] && inForza(byId[x.dati.dip]))));
              return (
                <div key={r.k} style={{ border: "1px solid var(--line)", borderTop: "4px solid var(--sic)", borderRadius: 8, padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <b>{r.n}</b>
                    <span className="tag" style={{ margin: 0 }}>{lista.length || "nessuno"}</span>
                  </div>
                  {lista.map((x) => {
                    const c = x.dati.dip && r.corso ? ultimo[x.dati.dip]?.[r.corso] : undefined;
                    const st = r.corso && x.dati.dip ? (c?.scadenza ? stato(c.scadenza) : c?.data ? "ok" : "scad") : "";
                    return (
                      <div key={x.id} onClick={() => modifica && setEdN(JSON.parse(JSON.stringify(x)))} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 6, marginBottom: 4, background: SFONDO[st as Stato] || "transparent", cursor: modifica ? "pointer" : undefined }}>
                        <span>{x.dati.dip ? byId[x.dati.dip]?.nome : x.dati.esterno}{x.dati.note && <small style={{ display: "block", color: "var(--muted)" }}>{x.dati.note}</small>}</span>
                        <small style={{ whiteSpace: "nowrap", color: "inherit" }}>{r.corso && x.dati.dip ? (c?.scadenza ? "corso fino al " + fd(c.scadenza) : c?.data ? "corso del " + fd(c.data) : "corso mancante") : x.dati.dal ? "dal " + fd(x.dati.dal) : ""}</small>
                      </div>
                    );
                  })}
                  {modifica && <button className="btn link" style={{ marginTop: 4 }} onClick={() => setEdN({ id: "", dati: { ruolo: r.k } })}>+ aggiungi</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "az" && (
        <div className="box">
          {edA && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 }}>
                <label style={{ ...lab, gridColumn: "span 2" }}>Cosa<input style={inp} value={edA.dati.nome || ""} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, nome: e.target.value } })} /></label>
                <label style={lab}>Ogni quanti mesi<input type="number" min={1} style={inp} value={edA.dati.mesi ?? ""} disabled={!modifica} onChange={(e) => { const mesi = Number(e.target.value) || undefined; setEdA({ ...edA, dati: { ...edA.dati, mesi, ...(mesi && edA.dati.ultimo ? { prossima: piuMesi(edA.dati.ultimo, mesi) } : {}) } }); }} /></label>
                <label style={lab}>Ultimo controllo<input type="date" style={inp} value={edA.dati.ultimo || ""} disabled title="Si aggiorna da solo quando si registra una verifica" /></label>
                <label style={lab}>Prossima scadenza<input type="date" style={inp} value={edA.dati.prossima || ""} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, prossima: e.target.value } })} /></label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
                <label style={lab}>Incaricato della verifica<select value={edA.dati.incaricato || ""} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, incaricato: e.target.value || undefined } })}><option value="">— da nominare —</option>{dip.filter((d) => inForza(d) || d.id === edA.dati.incaricato).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
                <label style={lab}>Note (riferimenti, chi chiamare)<input style={inp} value={edA.dati.note || ""} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, note: e.target.value } })} /></label>
              </div>
              <p className="tag" style={{ margin: 0 }}>{edA.id ? "Ogni controllo si registra con «Registra verifica» qui sotto (data, esito, firma): l'ultimo controllo e la prossima scadenza si aggiornano da soli e resta lo storico." : "Dopo aver salvato, ogni controllo si registra con «Registra verifica»: l'ultimo controllo e la prossima scadenza si aggiornano da soli."}</p>
              <label style={lab}>Controlli da fare a ogni verifica (uno per riga: compariranno come lista da spuntare)<textarea rows={4} style={inp} value={(edA.dati.controlli || []).join("\n")} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, controlli: e.target.value.split("\n").map((x) => x.replace(/^\s+/, "")).filter((x, i, a) => x || i < a.length - 1) } })} /></label>
              <label style={lab}>Procedura (cosa controllare, dove si trova il manuale)<textarea rows={4} style={inp} value={edA.dati.procedura || ""} disabled={!modifica} onChange={(e) => setEdA({ ...edA, dati: { ...edA.dati, procedura: e.target.value } })} /></label>
              {edA.id && (
                <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <b>Registro delle verifiche</b>
                    <span className="row" style={{ gap: 6 }}>
                      {ver.some((v) => v.dati.az === edA.id) && <button className="btn sec" onClick={() => scaricaVerifiche(edA, ver.filter((v) => v.dati.az === edA.id))}>Scarica registro (PDF)</button>}
                      {!edV && <button className="btn" onClick={() => { setEdV({ az: edA.id, data: oggi(), chi: edA.dati.incaricato, esito: "Conforme", ...(edA.dati.controlli?.filter(Boolean).length ? { controlli: edA.dati.controlli.filter(Boolean).map((voce) => ({ voce, ok: false })) } : {}) }); setFirmato(false); setFotoNuove([]); }}>Registra verifica</button>}
                    </span>
                  </div>
                  {edV && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10, padding: 10, border: "1px dashed var(--line)", borderRadius: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10 }}>
                        <label style={lab}>Data<input type="date" style={inp} value={edV.data} onChange={(e) => setEdV({ ...edV, data: e.target.value })} /></label>
                        <label style={lab}>Chi ha verificato<select value={edV.chi || ""} onChange={(e) => setEdV({ ...edV, chi: e.target.value })}><option value="">—</option>{dip.filter(inForza).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
                        <label style={lab}>Esito<select value={edV.esito || ""} onChange={(e) => setEdV({ ...edV, esito: e.target.value })}><option>Conforme</option><option>Non conforme</option></select></label>
                      </div>
                      {edV.controlli && (
                        <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                            <b style={{ fontSize: 13 }}>Controlli ({edV.controlli.filter((c) => c.ok).length} di {edV.controlli.length} OK)</b>
                            <button className="btn link" type="button" onClick={() => setEdV({ ...edV, controlli: edV.controlli!.map((c) => ({ ...c, ok: true })), esito: "Conforme" })}>Tutto OK</button>
                          </div>
                          {edV.controlli.map((c, i) => {
                            const set = (n: Partial<Voce>) => { const l = edV.controlli!.map((x, j) => (j === i ? { ...x, ...n } : x)); setEdV({ ...edV, controlli: l, esito: l.every((x) => x.ok) ? "Conforme" : "Non conforme" }); };
                            return (
                              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", borderTop: i ? "1px solid var(--line)" : undefined, flexWrap: "wrap" }}>
                                <label className="ck" style={{ flex: "1 1 260px" }}><input type="checkbox" checked={c.ok} onChange={(e) => set({ ok: e.target.checked })} /> {c.voce}</label>
                                {!c.ok && <input style={{ ...inp, flex: "1 1 200px", padding: "4px 8px" }} placeholder="cosa manca / da sostituire" value={c.nota || ""} onChange={(e) => set({ nota: e.target.value })} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <label style={lab}>Note<textarea rows={2} style={inp} value={edV.note || ""} onChange={(e) => setEdV({ ...edV, note: e.target.value })} /></label>
                      <label style={lab}>Foto (facoltative: dispositivo, bicchierino, modulo compilato…)
                        <input type="file" accept="image/*" multiple capture="environment" onChange={(e) => setFotoNuove([...fotoNuove, ...Array.from(e.target.files || [])])} />
                      </label>
                      {!!fotoNuove.length && <div className="row" style={{ gap: 6 }}>{fotoNuove.map((f, i) => <span key={i} className="chip">{f.name} <button className="btn link" onClick={() => setFotoNuove(fotoNuove.filter((_, j) => j !== i))}>✕</button></span>)}</div>}
                      <div style={lab}>Firma di chi ha verificato (con il dito o il mouse)
                        <Firma onCanvas={(c) => { firmaRef.current = c; }} onFirma={setFirmato} />
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <span style={{ flex: 1 }} />
                        <button className="btn sec" disabled={salvo} onClick={() => { setEdV(null); setFotoNuove([]); setFirmato(false); }}>Annulla</button>
                        <button className="btn" disabled={salvo} onClick={() => salvaVerifica(edA)}>{salvo ? "Salvo…" : "Salva verifica firmata"}</button>
                      </div>
                    </div>
                  )}
                  <div className="mx"><table>
                    <thead><tr><th>Data</th><th>Chi</th><th>Esito</th><th>Note</th><th>Firma</th><th>Foto</th><th></th></tr></thead>
                    <tbody>
                      {ver.filter((v) => v.dati.az === edA.id).map((v) => (
                        <tr key={v.id}>
                          <td>{fd(v.dati.data)}</td><td>{byId[v.dati.chi || ""]?.nome}</td>
                          <td style={{ color: v.dati.esito === "Non conforme" ? "var(--danger)" : undefined }}>{v.dati.esito}</td><td>{v.dati.controlli && <small style={{ color: "inherit" }} title={v.dati.controlli.filter((c) => !c.ok).map((c) => c.voce + (c.nota ? ": " + c.nota : "")).join("\n")}>{v.dati.controlli.filter((c) => c.ok).length}/{v.dati.controlli.length} controlli OK{v.dati.controlli.some((c) => !c.ok) ? " · da sistemare: " + v.dati.controlli.filter((c) => !c.ok).map((c) => c.voce + (c.nota ? " (" + c.nota + ")" : "")).join("; ") : ""}</small>}{v.dati.note}</td>
                          <td>{v.dati.firma && url[v.dati.firma] ? <img src={url[v.dati.firma]} alt="firma" style={{ height: 34, background: "#fff", borderRadius: 4 }} /> : v.dati.firma ? "…" : ""}</td>
                          <td>{(v.dati.foto || []).map((f, i) => url[f.path] ? <a key={i} href={url[f.path]} target="_blank" rel="noreferrer"><img src={url[f.path]} alt={f.nome || "foto"} style={{ height: 34, width: 34, objectFit: "cover", borderRadius: 4, marginRight: 4 }} /></a> : null)}</td>
                          <td><button className="btn sec" onClick={() => scaricaVerifiche(edA, [v])}>PDF</button></td>
                        </tr>
                      ))}
                      {!ver.some((v) => v.dati.az === edA.id) && <tr><td colSpan={7} style={{ color: "var(--muted)" }}>Nessuna verifica registrata.</td></tr>}
                    </tbody>
                  </table></div>
                </div>
              )}
              <div className="row">
                
                <span style={{ flex: 1 }} />
                {gestisce && edA.id && <button className="btn danger" onClick={() => { if (confirm("Eliminare questa scadenza?")) { togli("azienda", edA.id, "Scadenza eliminata."); setEdA(null); } }}>Elimina</button>}
                <button className="btn sec" onClick={() => setEdA(null)}>{modifica ? "Annulla" : "Chiudi"}</button>
                {modifica && <button className="btn" onClick={async () => { if (!edA.dati.nome?.trim()) { setMsg({ t: "Scrivi cosa va controllato.", err: true }); return; } if (await scrivi("azienda", edA.id || uid(), edA.dati, "Scadenza salvata.")) setEdA(null); }}>Salva</button>}
              </div>
            </div>
          )}
          <div className="mx"><table>
            <thead><tr><th>Cosa</th><th>Frequenza</th><th>Incaricato</th><th>Ultimo controllo</th><th>Prossima scadenza</th><th>Note</th></tr></thead>
            <tbody>
              {az.map((a) => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => setEdA(JSON.parse(JSON.stringify(a)))}>
                  <td><b>{a.dati.nome}</b></td><td>{a.dati.mesi ? (a.dati.mesi === 1 ? "ogni mese" : `ogni ${a.dati.mesi} mesi`) : ""}</td><td>{a.dati.incaricato ? byId[a.dati.incaricato]?.nome : <small>da nominare</small>}</td><td>{fd(a.dati.ultimo)}</td>{cella(a.dati.prossima)}<td><small style={{ color: "inherit" }}>{a.dati.note}</small></td>
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
            <select value={annoI} onChange={(e) => setAnnoI(e.target.value)}><option value="">Tutti gli anni</option>{anniI.map((a) => <option key={a.anno}>{a.anno}</option>)}</select>
            <span style={{ flex: 1 }} />
            <button className="btn sec" disabled={!infVis.length} onClick={esportaInfortuni}>Esporta Excel</button>
          </div>
          {!!anniI.length && (
            <div className="mx" style={{ marginBottom: 14 }}><table>
              <thead><tr><th>Anno</th><th>Infortuni</th><th>Giorni di assenza</th><th>Media giorni</th><th>Persone coinvolte</th></tr></thead>
              <tbody>
                {anniI.map((a) => (
                  <tr key={a.anno} style={{ cursor: "pointer", fontWeight: annoI === a.anno ? 700 : undefined }} onClick={() => setAnnoI(annoI === a.anno ? "" : a.anno)}>
                    <td>{a.anno}</td><td>{a.n}</td><td>{a.gg}</td><td>{a.n ? (a.gg / a.n).toLocaleString("it-IT", { maximumFractionDigits: 1 }) : ""}</td><td>{a.pers}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th>Totale</th><th>{anniI.reduce((t, a) => t + a.n, 0)}</th><th>{anniI.reduce((t, a) => t + a.gg, 0)}</th><th></th><th></th></tr></tfoot>
            </table></div>
          )}
          <p className="tag" style={{ marginTop: 0 }}>Il riepilogo per anno conta tutti gli infortuni, anche di chi non è più in forza. Clic su un anno per filtrare l&apos;elenco.</p>
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
              {infVis.map((x) => (
                <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => setEdI(JSON.parse(JSON.stringify(x)))}>
                  <td>{fd(x.dati.data)}</td><td>{byId[x.dati.dip || ""]?.nome || x.dati.nome}</td><td>{x.dati.luogo}</td><td>{x.dati.desc}</td><td>{x.dati.giorni}</td>
                </tr>
              ))}
              {!infVis.length && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>Nessun infortunio registrato.</td></tr>}
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
        <label className="ck"><input type="checkbox" checked={!!edC.dati.chiuso} onChange={(e) => setEdC({ ...edC, dati: { ...edC.dati, chiuso: e.target.checked || undefined } })} /> Non da rinnovare (la persona non svolge più questa attività): esce dalle scadenze</label>
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

// Riquadro per firmare con il dito (telefono, tablet) o con il mouse
function Firma({ onCanvas, onFirma }: { onCanvas: (c: HTMLCanvasElement | null) => void; onFirma: (b: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const giu = useRef(false);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect(), k = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
    const g = c.getContext("2d")!; g.scale(k, k); g.lineWidth = 2.2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#111";
    onCanvas(c);
    return () => onCanvas(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  return (
    <div>
      <canvas ref={ref} style={{ width: "100%", maxWidth: 520, height: 150, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, touchAction: "none", cursor: "crosshair", display: "block" }}
        onPointerDown={(e) => { giu.current = true; ref.current!.setPointerCapture(e.pointerId); const g = ref.current!.getContext("2d")!; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke(); onFirma(true); }}
        onPointerMove={(e) => { if (!giu.current) return; const g = ref.current!.getContext("2d")!; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); }}
        onPointerUp={() => { giu.current = false; }} onPointerCancel={() => { giu.current = false; }} />
      <button className="btn link" type="button" onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onFirma(false); }}>Cancella firma</button>
    </div>
  );
}

// Foto ridotte a 1600 px in JPEG prima del caricamento
async function rimpicciolisci(f: File): Promise<Blob> {
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("foto"))), "image/jpeg", 0.82));
}
