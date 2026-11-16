"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { creaClaude } from "@/moduli/offerte-bmtek/shim";

type Utente = { id: string; nome: string; email: string };
type Db = { collection: (c: string) => unknown; doc: (p: string) => unknown };
type Base = { use: (n: string) => Promise<unknown> };

// Raccolte proprie del Controllo di gestione (tabella cg_docs). Tutto il resto
// (commesse, macchine, persone, agenda, ore, tempi, config…) è il Piano produzione (pp_docs).
const PROPRIE = new Set(["costi", "sam"]);
const radice = (p: string) => p.split("/")[0];

// La pagina originale del Controllo di gestione gira in un riquadro.
export default function ControlloGestione({ livello, utente }: { livello: string; utente: Utente }) {
  const [pronto, setPronto] = useState(false);
  const [vuoto, setVuoto] = useState(false);
  const [stato, setStato] = useState("");
  const [chiave, setChiave] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const gestisce = livello === "gestisce";
  const modifica = gestisce || livello === "modifica";

  useEffect(() => {
    const sb = supabaseBrowser();
    const cap = ["db", "user", "downloads"];
    const pp = creaClaude({ supabase: sb, utente, livello: "legge", tabella: "pp_docs", capacita: cap, rpcAggiorna: "pp_aggiorna", tempoReale: true }) as Base;
    const cg = creaClaude({ supabase: sb, utente, livello, tabella: "cg_docs", capacita: cap }) as Base;
    const user = {
      id: async () => utente.id,
      can: (k: string) => (k === "data.write" ? modifica : null),
      canEdit: async () => true, // chi apre il modulo vede i costi; i permessi sono quelli del gestionale
      isOwner: async () => gestisce, // Gestisce = titolare: tutte le sezioni e «Utenti e permessi»
      profiles: async (ids: string[]) => {
        const out: Record<string, { name: string }> = {};
        const { data } = await sb.from("profili").select("id,nome,email").in("id", ids.filter((i) => /^[0-9a-f-]{36}$/.test(i)));
        (data || []).forEach((p: { id: string; nome: string; email: string }) => { out[p.id] = { name: p.nome || p.email }; });
        return out;
      },
    };
    let db: Db | null = null;
    (window as unknown as { KIMATIC_CG: unknown }).KIMATIC_CG = {
      use: async (n: string) => {
        if (n === "user") return user;
        if (n === "mcp") return null;
        if (n !== "db") return cg.use(n);
        if (db) return db;
        const [dp, dc] = (await Promise.all([pp.use("db"), cg.use("db")])) as [Db, Db];
        db = {
          collection: (c: string) => (PROPRIE.has(radice(c)) ? dc : dp).collection(c),
          doc: (p: string) => (PROPRIE.has(radice(p)) ? dc : dp).doc(p),
        };
        return db;
      },
    };
    if (gestisce) {
      sb.from("cg_docs").select("id", { count: "exact", head: true }).then(({ count }) => setVuoto(!count));
    }
    setPronto(true);
  }, [livello, utente, gestisce, modifica]);

  // Importa il file «Scarica i dati ora» del Controllo di gestione su claude.ai
  async function importa(f: File) {
    let J: { docs?: Record<string, unknown>; sam?: Record<string, unknown> };
    try { J = JSON.parse(await f.text()); } catch { setStato("Il file non è un JSON valido."); return; }
    const righe = [
      ...Object.entries(J.docs || {}).map(([id, dati]) => ({ coll: "costi", id, dati })),
      ...Object.entries(J.sam || {}).map(([id, dati]) => ({ coll: "sam", id, dati })),
    ];
    if (!righe.length || !J.docs) { setStato("Nel file non ci sono dati dei costi: usa «Scarica i dati ora» del Controllo di gestione."); return; }
    const sb = supabaseBrowser();
    for (let i = 0; i < righe.length; i += 50) {
      setStato(`Importazione: ${i} di ${righe.length}…`);
      const { error } = await sb.from("cg_docs").upsert(righe.slice(i, i + 50));
      if (error) { setStato("Errore: " + error.message); return; }
    }
    const nc = Object.keys(J.docs || {}).length, ns = Object.keys(J.sam || {}).length;
    setStato(`Importati ${nc} documenti dei costi e ${ns} dei materiali SAM.`);
    setVuoto(false);
    setChiave((k) => k + 1);
  }

  if (!pronto) return <div className="empty">Caricamento…</div>;
  const alto = vuoto || stato ? 46 : 0;
  return (
    <>
      {(vuoto || stato) && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", marginBottom: 8, border: "1px solid var(--line)", borderRadius: 10, background: "#fffbe6", fontSize: 14 }}>
          {vuoto && <span>Il Controllo di gestione non ha ancora dati. Carica il file scaricato dalla versione su claude.ai (Tariffe e costi fissi → Scarica i dati ora).</span>}
          {vuoto && <button className="btn" onClick={() => file.current?.click()}>Importa dati</button>}
          {stato && <b>{stato}</b>}
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importa(f); }} />
        </div>
      )}
      <iframe key={chiave} src="/cdg/index.html" title="Controllo di gestione"
        style={{ width: "100%", height: `calc(100vh - ${56 + alto}px)`, border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
    </>
  );
}
