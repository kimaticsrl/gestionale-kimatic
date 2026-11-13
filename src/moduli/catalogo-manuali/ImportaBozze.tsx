"use client";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { abbina, type Macchina, type Lingua } from "./importa";

const nuovoId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const NOME = /^(.*?)[-_ ]([A-Za-z]{2})[-_ ]?rev\.?[-_ ]?(\d{1,3})/i;
const NOTA = "Tradotto con AI";
type Riga = { file: File; documento: string; lingua: string; rev: string; macchina: string; esito?: string };

// Carica le traduzioni nel catalogo: stato «Tradotto AI» (o «Tradotto» se già approvate).
// Non sostituisce mai una lingua che ha già un manuale valido (Originale, Tradotto o Da aggiornare con PDF).
export default function ImportaBozze({ sb, chiudi, fatto }: { sb: SupabaseClient; chiudi: () => void; fatto: () => void }) {
  const [righe, setRighe] = useState<Riga[]>([]);
  const [macchine, setMacchine] = useState<Macchina[]>([]);
  const [stato, setStato] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [statoNuovo, setStatoNuovo] = useState<"ai" | "ok">("ai");

  async function scelta(files: FileList | null) {
    if (!files?.length) return;
    const { data } = await sb.from("man_docs").select("id,dati").eq("coll", "macchine");
    const mm = (data ?? []).map((r: { id: string; dati: Omit<Macchina, "id"> }) => ({ id: r.id, ...r.dati })) as Macchina[];
    mm.sort((a, b) => a.modello.localeCompare(b.modello, "it"));
    const rr: Riga[] = [];
    for (const f of Array.from(files)) {
      if (!/\.pdf$/i.test(f.name)) continue;
      const m = NOME.exec(f.name);
      if (!m) continue;
      const documento = m[1].replace(/[-_]+/g, " ").trim();
      const prop = abbina(m[1], mm) || abbina(documento, mm);
      rr.push({ file: f, documento, lingua: m[2].toUpperCase(), rev: m[3].padStart(2, "0"), macchina: prop?.id || "" });
    }
    rr.sort((a, b) => a.documento.localeCompare(b.documento) || a.lingua.localeCompare(b.lingua));
    setMacchine(mm); setRighe(rr);
    setStato(`${rr.length} PDF riconosciuti. Controlla la macchina di ogni documento: quelli senza macchina non vengono caricati.`);
  }

  const documenti = [...new Set(righe.map((r) => r.documento))];
  const cambia = (doc: string, id: string) => setRighe((rr) => rr.map((r) => (r.documento === doc ? { ...r, macchina: id } : r)));

  async function carica() {
    setLavoro(true);
    const out = righe.map((r) => ({ ...r }));
    const perMacchina = new Map<string, Riga[]>();
    out.forEach((r) => { if (r.macchina) perMacchina.set(r.macchina, [...(perMacchina.get(r.macchina) || []), r]); else r.esito = "non caricato: nessuna macchina"; });
    const lingueNuove = new Set<string>();
    let fatti = 0;
    for (const [id, lista] of perMacchina) {
      const { data } = await sb.from("man_docs").select("dati").eq("coll", "macchine").eq("id", id).maybeSingle();
      if (!data) { lista.forEach((r) => (r.esito = "macchina non trovata")); continue; }
      const m = data.dati as Omit<Macchina, "id">;
      const lingue: Record<string, Lingua> = { ...(m.lingue || {}) };
      for (const r of lista) {
        const prima = lingue[r.lingua];
        if (prima?.pdf && prima.stato !== "bozza" && prima.stato !== "ai") { r.esito = `saltato: c'è già il manuale ${prima.stato === "originale" ? "originale" : "valido"} (rev ${prima.rev || "?"})`; continue; }
        setStato(`Carico ${r.file.name} (${++fatti})…`);
        const pid = nuovoId();
        const { error } = await sb.storage.from("manuali").upload(`${pid}.pdf`, r.file, { contentType: "application/pdf" });
        if (error) { r.esito = "errore: " + error.message; continue; }
        lingue[r.lingua] = { ...(prima || {}), rev: r.rev, data: "", stato: statoNuovo, note: statoNuovo === "ai" ? NOTA : "Traduzione approvata", pdf: { id: pid, nome: r.file.name, size: r.file.size } };
        lingueNuove.add(r.lingua);
        r.esito = statoNuovo === "ok" ? "caricato come tradotto" : "caricato come tradotto AI";
      }
      const { error } = await sb.from("man_docs").upsert({ coll: "macchine", id, dati: { ...m, lingue, aggiornato: new Date().toISOString() } });
      if (error) lista.forEach((r) => (r.esito = "errore nel salvataggio: " + error.message));
    }
    if (lingueNuove.size) {
      const { data: c } = await sb.from("man_docs").select("dati").eq("coll", "config").eq("id", "main").maybeSingle();
      const cfg = (c?.dati || { categorie: [], lingue: ["IT", "EN"] }) as { categorie: string[]; lingue: string[] };
      await sb.from("man_docs").upsert({ coll: "config", id: "main", dati: { ...cfg, lingue: [...new Set([...(cfg.lingue || []), ...lingueNuove])] } });
    }
    setRighe(out); setLavoro(false);
    const ok = out.filter((r) => /^caricato/.test(r.esito || "")).length;
    setStato(`Fatto: ${ok} PDF caricati, ${out.length - ok} non caricati (vedi la colonna Esito).`);
    fatto();
  }

  return (
    <div className="box" style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Carica traduzioni</h2>
        <button className="btn sec" onClick={chiudi} disabled={lavoro}>Chiudi</button>
      </div>
      <p className="tag" style={{ margin: 0 }}>
        Scegli i PDF tradotti (es. Smart_XL-FI_rev01.pdf). Ogni PDF entra nel catalogo con lo stato scelto qui sotto (di norma «Tradotto AI»).
        Una lingua che ha già un manuale valido non viene toccata. Una traduzione già caricata come «Tradotto AI» o «Bozza» viene sostituita.
      </p>
      {!righe.length && <label className="btn" style={{ alignSelf: "flex-start" }}>Scegli i PDF…
        <input type="file" hidden multiple accept="application/pdf,.pdf" onChange={(e) => scelta(e.target.files)} /></label>}
      {stato && <p className="msg" role="status" style={{ margin: 0 }}>{stato}</p>}
      {righe.length > 0 && (
        <>
          <div className="mx" style={{ maxHeight: "45vh", overflow: "auto" }}>
            <table>
              <thead><tr><th>Documento</th><th>Macchina nel catalogo</th><th>Lingue</th><th>Esito</th></tr></thead>
              <tbody>{documenti.map((d) => {
                const rr = righe.filter((r) => r.documento === d);
                return (
                  <tr key={d}>
                    <td>{d}</td>
                    <td><select value={rr[0].macchina} disabled={lavoro || rr.some((r) => r.esito)} onChange={(e) => cambia(d, e.target.value)} aria-label={"Macchina per " + d}>
                      <option value="">— non caricare —</option>
                      {macchine.map((m) => <option key={m.id} value={m.id}>{m.modello}</option>)}
                    </select></td>
                    <td style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{rr.map((r) => `${r.lingua} rev${r.rev}`).join(" · ")}</td>
                    <td><small>{[...new Set(rr.map((r) => r.esito).filter(Boolean))].join("; ")}</small></td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
          {!righe.some((r) => r.esito) && <div className="row">
            <label>Stato <select value={statoNuovo} onChange={(e) => setStatoNuovo(e.target.value as "ai" | "ok")} disabled={lavoro}>
              <option value="ai">Tradotto AI</option><option value="ok">Tradotto (approvato)</option></select></label>
            <button className="btn" onClick={carica} disabled={lavoro || !righe.some((r) => r.macchina)}>{lavoro ? "Carico…" : `Carica ${righe.filter((r) => r.macchina).length} PDF`}</button></div>}
        </>
      )}
    </div>
  );
}
