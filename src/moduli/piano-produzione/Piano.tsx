"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { creaClaude } from "@/moduli/offerte-bmtek/shim";

type Utente = { id: string; nome: string; email: string };
type Snap = { docs: { id: string; data: () => Record<string, unknown> }[] };
type Db = {
  collection: (c: string) => { onSnapshot: (ok: (s: Snap) => void, err?: (e: unknown) => void) => () => void } & Record<string, unknown>;
  doc: (p: string) => unknown;
};
type Base = { use: (n: string) => Promise<unknown> };

// Ruolo interno del Piano (schede visibili e modificabili) proposto in base ai ruoli del gestionale,
// finché l'amministratore non ne assegna uno in «Utenti e permessi» dentro il Piano.
function ruoloInterno(ruoli: string[]) {
  if (ruoli.some((r) => r === "pianificatore" || r === "direzione")) return "pian";
  if (ruoli.includes("acquisti")) return "acqu";
  if (ruoli.includes("operativo")) return "oper";
  return "";
}

// La pagina originale del Piano produzione gira in un riquadro: i dati stanno nella tabella pp_docs.
// soloCliente: modulo «Gantt linee produzione», mostra solo la scheda Cliente e TV, in sola lettura.
export default function Piano({ livello, utente, ruoli, soloCliente = false }: { livello: string; utente: Utente; ruoli: string[]; soloCliente?: boolean }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    const lv = soloCliente ? "legge" : livello;
    const base = creaClaude({ supabase: sb, utente, livello: lv, tabella: "pp_docs", capacita: ["db", "user", "downloads"], rpcAggiorna: "pp_aggiorna", tempoReale: true }) as Base;
    const gestisce = lv === "gestisce";
    const modifica = gestisce || lv === "modifica";
    const proposto = ruoloInterno(ruoli);
    const user = {
      id: async () => utente.id,
      can: (k: string) => (k === "data.write" ? (soloCliente ? null : modifica) : null),
      canEdit: async () => gestisce,
      isOwner: async () => false, // registro e appunti personali sono gestiti dal gestionale
      profiles: async (ids: string[]) => {
        const out: Record<string, { name: string }> = {};
        const { data } = await sb.from("profili").select("id,nome,email").in("id", ids.filter((i) => /^[0-9a-f-]{36}$/.test(i)));
        (data || []).forEach((p: { id: string; nome: string; email: string }) => { out[p.id] = { name: p.nome || p.email }; });
        return out;
      },
    };
    let dbWrap: Db | null = null;
    (window as unknown as { KIMATIC_PP: unknown }).KIMATIC_PP = {
      soloCliente,
      use: async (n: string) => {
        if (n === "user") return user;
        if (n !== "db") return base.use(n);
        if (dbWrap) return dbWrap;
        const db = (await base.use("db")) as Db;
        dbWrap = {
          ...db,
          collection: (c: string) => {
            const col = db.collection(c);
            if (c !== "accessi" || !proposto) return col;
            return {
              ...col,
              onSnapshot: (ok: (s: Snap) => void, err?: (e: unknown) => void) =>
                col.onSnapshot((s: Snap) => {
                  const docs = s.docs.slice();
                  const i = docs.findIndex((d) => d.id === "utenti");
                  const dati = (i >= 0 ? docs[i].data() : {}) as { u?: Record<string, unknown> };
                  if (!dati.u || !dati.u[utente.id]) {
                    const nuovo = { ...dati, u: { ...(dati.u || {}), [utente.id]: { n: utente.nome || utente.email, on: true, r: proposto } } };
                    const doc = { id: "utenti", data: () => JSON.parse(JSON.stringify(nuovo)) };
                    if (i >= 0) docs[i] = doc; else docs.push(doc);
                  }
                  ok({ ...s, docs });
                }, err),
            };
          },
        } as Db;
        return dbWrap;
      },
    };
    setPronto(true);
  }, [livello, utente, ruoli, soloCliente]);
  if (!pronto) return <div className="empty">Caricamento…</div>;
  return (
    <iframe src="/piano/index.html" title={soloCliente ? "Gantt linee produzione" : "Piano produzione"}
      style={{ width: "100%", height: "calc(100vh - 56px)", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
  );
}
