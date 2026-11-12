"use client";
import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import "./rapporti.css";
import ReportOre from "./ReportOre";

type Props = { me: string; nome: string; modifica: boolean; gestisce: boolean; clienti: boolean };

async function logoBmtek(): Promise<string> {
  const blob = await (await fetch("/logo-bmtek.png")).blob();
  return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
}

export default function Rapporti({ me, nome, modifica, gestisce, clienti }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ferma: (() => void) | undefined;
    let annullato = false;
    (async () => {
      const [{ avvia }, { creaDb }, logo] = await Promise.all([import("./app.js"), import("./dati.js"), logoBmtek()]);
      if (annullato || !root.current) return;
      const sb = supabaseBrowser();
      ferma = avvia(root.current, {
        me, nome, modifica, gestisce, clienti, logo,
        db: creaDb(sb),
        // anagrafica articoli (da SAM): descrizione delle parti sostituite dal codice
        async articolo(cod: string) {
          const c = cod.trim(); if (!c) return null;
          const { data } = await sb.from("articoli").select("codice,descrizione").ilike("codice", c.replace(/[%_\\]/g, "\\$&")).limit(1);
          return data?.[0] ?? null;
        },
        async cercaArticoli(q: string) {
          const p = '"%' + q.trim().replace(/[%_"\\]/g, "") + '%"';
          const { data } = await sb.from("articoli").select("codice,descrizione").or(`codice.ilike.${p},descrizione.ilike.${p}`).order("codice").limit(20);
          return data ?? [];
        },
        jsPDF: async () => (await import("jspdf")).jsPDF,
        downloads: {
          async save({ filename, data }: { filename: string; data: Blob }) {
            const url = URL.createObjectURL(data);
            const a = document.createElement("a");
            a.href = url; a.download = filename; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          },
        },
      });
    })();
    return () => { annullato = true; ferma?.(); };
  }, [me, nome, modifica, gestisce, clienti]);

  return (
    <div className="ri" ref={root} style={{ position: "relative" }}>
      <div className="bar">
        <img src="/logo-bmtek.png" alt="BMTEK" />
        <h1>Rapporti d&apos;intervento</h1>
        <nav className="tabs" data-ri="tabs" aria-label="Sezioni del modulo" />
        <span className="sp" />
        {gestisce && <ReportOre />}
        <span className="sync" data-ri="sync">Connessione…</span>
      </div>
      <div data-ri="app"><div className="empty">Caricamento dei rapporti…</div></div>
      <div className="toast" data-ri="toast" hidden />
    </div>
  );
}
