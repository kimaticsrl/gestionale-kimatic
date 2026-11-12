"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
function mesePrec() {
  const o = new Date();
  return { da: iso(new Date(o.getFullYear(), o.getMonth() - 1, 1)), a: iso(new Date(o.getFullYear(), o.getMonth(), 0)) };
}

// Pulsante e finestra per scaricare il report ore (Excel) per l'ufficio amministrativo
export default function ReportOre() {
  const [aperto, setAperto] = useState(false);
  const [{ da, a }, setPer] = useState(mesePrec);
  const [stato, setStato] = useState("");

  function mese(delta: number) {
    const o = new Date(), d = new Date(o.getFullYear(), o.getMonth() + delta, 1);
    setPer({ da: iso(d), a: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) });
  }

  async function scarica() {
    if (!da || !a || da > a) { setStato("Controlla le date del periodo."); return; }
    setStato("Preparo il report…");
    try {
      const sb = supabaseBrowser();
      const tutti: { dati: unknown }[] = [];
      for (let i = 0; ; i += 1000) {
        const { data, error } = await sb.from("rapporti").select("dati").order("id").range(i, i + 999);
        if (error) throw error;
        tutti.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const [{ righeReport, creaExcel }, ExcelJS] = await Promise.all([import("./reportOre.js"), import("exceljs")]);
      // paese dei clienti dall'Anagrafica, per distinguere le trasferte in Italia e all'estero
      const paesi: Record<string, string> = {};
      for (let i = 0; ; i += 1000) {
        const { data } = await sb.from("clienti").select("id,dati").range(i, i + 999);
        (data ?? []).forEach((c: { id: string; dati: { paese?: string } }) => { paesi[c.id] = c.dati?.paese || ""; });
        if (!data || data.length < 1000) break;
      }
      const righe = righeReport(tutti, da, a, (r: { cli?: { id?: string } }) => paesi[r.cli?.id || ""] || "");
      if (!righe.length) { setStato("Nessuna giornata di intervento in questo periodo."); return; }
      const blob = await creaExcel(ExcelJS.default ?? ExcelJS, righe, da, a);
      const url = URL.createObjectURL(blob), el = document.createElement("a");
      el.href = url; el.download = `Report_ore_tecnici_${da}_${a}.xlsx`; el.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const avvisi = righe.filter((r: { avvisi: string }) => r.avvisi).length;
      setStato(`Scaricato: ${righe.length} righe.${avvisi ? ` ${avvisi} da verificare (colonna «Da verificare»).` : ""}`);
    } catch (e) {
      setStato("Report non riuscito: " + ((e as Error).message || "errore"));
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setAperto(!aperto); setStato(""); }}>Report ore</button>
      {aperto && (
        <section className="panel" style={{ position: "absolute", right: 16, top: 64, zIndex: 20, width: "min(420px, calc(100vw - 32px))", boxShadow: "0 8px 30px rgba(0,0,0,.18)" }}>
          <h2>Report ore per l&apos;amministrazione</h2>
          <p className="note" style={{ margin: "0 0 10px" }}>
            File Excel con ore di lavoro (ordinarie e straordinarie oltre le 8 ore), ore di viaggio, km, sabati/domeniche/festivi
            e notti fuori sede (indennità di trasferta), distinte tra Italia ed estero. Una riga per tecnico e per giornata, più il riepilogo.
          </p>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <button type="button" className="sm" onClick={() => mese(-1)}>Mese scorso</button>
            <button type="button" className="sm" onClick={() => mese(0)}>Questo mese</button>
          </div>
          <div className="g">
            <label>Dal<input type="date" value={da} onChange={(e) => setPer({ da: e.target.value, a })} /></label>
            <label>Al<input type="date" value={a} onChange={(e) => setPer({ da, a: e.target.value })} /></label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="pri" onClick={scarica}>Scarica Excel</button>
            <button type="button" onClick={() => setAperto(false)}>Chiudi</button>
          </div>
          {stato && <p className="note" role="status" style={{ marginTop: 10 }}>{stato}</p>}
        </section>
      )}
    </>
  );
}
