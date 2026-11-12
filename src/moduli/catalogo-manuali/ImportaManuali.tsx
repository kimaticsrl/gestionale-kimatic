"use client";
import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analizza, piano, slug, type Macchina, type Lingua, type Pdf, type Voce, type Scartato } from "./importa";

const nuovoId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const MB = (b: number) => (b / 1048576).toLocaleString("it-IT", { maximumFractionDigits: 0 }) + " MB";
const NUOVA_CAT = "DA CLASSIFICARE";
type Piano = ReturnType<typeof piano>;

// Importa una cartella di manuali dal PC (es. T:\MANUALI\MANUALI IN VIGORE) nel catalogo
export default function ImportaManuali({ sb, chiudi, fatto }: { sb: SupabaseClient; chiudi: () => void; fatto: () => void }) {
  const [p, setP] = useState<Piano | null>(null);
  const [scartati, setScartati] = useState<Scartato[]>([]);
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [storico, setStorico] = useState(true);
  const [stato, setStato] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [prog, setProg] = useState({ fatti: 0, tot: 0, byte: 0, totByte: 0 });
  const [errori, setErrori] = useState<string[]>([]);
  const [esistenti, setEsistenti] = useState<Macchina[]>([]);

  async function leggiCatalogo() {
    const { data } = await sb.from("man_docs").select("id,dati").eq("coll", "macchine");
    return (data ?? []).map((r: { id: string; dati: Omit<Macchina, "id"> }) => ({ id: r.id, ...r.dati })) as Macchina[];
  }

  async function sceltaCartella(files: FileList | null) {
    if (!files?.length) return;
    setStato("Leggo la cartella…");
    const lista = Array.from(files).map((f) => ({ percorso: (f as File & { webkitRelativePath: string }).webkitRelativePath || f.name, size: f.size, file: f }));
    const { voci, scartati } = analizza(lista);
    const macchine = await leggiCatalogo();
    const pp = piano(voci, macchine);
    setEsistenti(macchine); setP(pp); setScartati(scartati.filter((s) => !/doppione/.test(s.motivo)));
    setScelti(new Set(pp.map((x) => x.cartella)));
    setStato(`${lista.length} file letti, ${voci.length} manuali riconosciuti.`);
  }

  const daCaricare = useMemo(() => {
    if (!p) return { n: 0, byte: 0 };
    let n = 0, byte = 0;
    p.filter((x) => scelti.has(x.cartella)).forEach((x) => x.perLingua.forEach((l) => {
      if (l.vigore && !l.giaCaricato) { n++; byte += l.vigore.size; }
      if (storico) l.storico.forEach((v) => { if (!x.esistente?.lingue?.[l.lingua]?.storico?.some((h) => h.rev === v.rev)) { n++; byte += v.size; } });
    }));
    return { n, byte };
  }, [p, scelti, storico]);

  async function carica(v: Voce): Promise<Pdf> {
    const id = nuovoId();
    const { error } = await sb.storage.from("manuali").upload(`${id}.pdf`, v.file!, { contentType: "application/pdf" });
    if (error) throw new Error(`${v.percorso}: ${error.message}`);
    setProg((x) => ({ ...x, fatti: x.fatti + 1, byte: x.byte + v.size }));
    return { id, nome: v.percorso.split("/").pop() || "manuale.pdf", size: v.size };
  }

  async function importa() {
    if (!p) return;
    setLavoro(true); setErrori([]);
    setProg({ fatti: 0, tot: daCaricare.n, byte: 0, totByte: daCaricare.byte });
    const err: string[] = [];
    const ids = new Set(esistenti.map((m) => m.id));
    const lingueNuove = new Set<string>();
    let categoriaNuova = false;
    for (const x of p.filter((y) => scelti.has(y.cartella))) {
      setStato(`Carico ${x.cartella}…`);
      try {
        const base: Macchina = x.esistente ? JSON.parse(JSON.stringify(x.esistente)) : (() => {
          let id = slug(x.cartella) || "macchina"; while (ids.has(id)) id += "-2"; ids.add(id);
          categoriaNuova = true;
          return { id, modello: x.cartella, categoria: NUOVA_CAT, codice: "", note: "Importata da MANUALI IN VIGORE", lingue: {} };
        })();
        const lingueX = x.perLingua.map((l) => l.lingua);
        base.originale = base.originale || (lingueX.includes("IT") ? "IT" : lingueX[0]);
        const lingue: Record<string, Lingua> = base.lingue || {};
        // tre caricamenti alla volta
        const compiti: (() => Promise<void>)[] = [];
        for (const l of x.perLingua) {
          lingueNuove.add(l.lingua);
          const prima: Lingua = lingue[l.lingua] || {};
          const voce: Lingua = { ...prima, storico: [...(prima.storico || [])] };
          lingue[l.lingua] = voce;
          if (l.vigore && !l.giaCaricato) {
            const v = l.vigore;
            compiti.push(async () => {
              const pdf = await carica(v);
              if (prima.pdf && prima.rev !== v.rev) voce.storico!.unshift({ rev: prima.rev || "", data: prima.data || "", pdf: prima.pdf });
              Object.assign(voce, { rev: v.rev, data: v.data || prima.data || "", pdf, stato: l.lingua === base.originale ? "originale" : prima.stato && prima.stato !== "aggiornare" ? prima.stato : "ok" });
            });
          } else if (!l.vigore && !prima.rev) {
            // solo revisioni vecchie: la lingua resta «da aggiornare»
            Object.assign(voce, { rev: l.storico[0]?.rev || "", data: l.storico[0]?.data || "", stato: "aggiornare", note: "Solo revisioni precedenti in MANUALI IN VIGORE" });
          }
          if (storico) for (const v of l.storico) {
            if (voce.storico!.some((h) => h.rev === v.rev) || (l.vigore && v.rev === l.vigore.rev)) continue;
            compiti.push(async () => { const pdf = await carica(v); voce.storico!.push({ rev: v.rev, data: v.data, pdf }); });
          }
        }
        for (let i = 0; i < compiti.length; i += 3) {
          const r = await Promise.allSettled(compiti.slice(i, i + 3).map((f) => f()));
          r.forEach((z) => { if (z.status === "rejected") err.push(String((z.reason as Error)?.message || z.reason)); });
        }
        Object.values(lingue).forEach((v) => { v.storico?.sort((a, b) => parseInt(b.rev) - parseInt(a.rev)); if (!v.storico?.length) delete v.storico; });
        const { id, ...dati } = { ...base, lingue, aggiornato: new Date().toISOString() };
        const { error } = await sb.from("man_docs").upsert({ coll: "macchine", id, dati });
        if (error) err.push(`${x.cartella}: ${error.message}`);
      } catch (e) { err.push(`${x.cartella}: ${(e as Error).message}`); }
      setErrori([...err]);
    }
    // lingue e categoria nuove nella configurazione del catalogo
    const { data: c } = await sb.from("man_docs").select("dati").eq("coll", "config").eq("id", "main").maybeSingle();
    const cfg = (c?.dati || { categorie: [], lingue: ["IT", "EN"] }) as { categorie: string[]; lingue: string[] };
    const nuovaCfg = { ...cfg, lingue: [...new Set([...(cfg.lingue || []), ...lingueNuove])], categorie: categoriaNuova && !cfg.categorie.includes(NUOVA_CAT) ? [...cfg.categorie, NUOVA_CAT] : cfg.categorie };
    await sb.from("man_docs").upsert({ coll: "config", id: "main", dati: nuovaCfg });
    setLavoro(false);
    setStato(err.length ? `Importazione finita con ${err.length} errori (vedi sotto).` : "Importazione completata.");
    fatto();
  }

  const tutti = p?.length && scelti.size === p.length;
  return (
    <div className="box" style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Importa una cartella di manuali</h2>
        <button className="btn sec" onClick={chiudi} disabled={lavoro}>Chiudi</button>
      </div>
      <p className="tag" style={{ margin: 0 }}>
        Scegli la cartella «MANUALI IN VIGORE»: ogni sottocartella è una macchina; dal nome dei PDF (es. AMW-FR_rev04.pdf) ricavo lingua e revisione.
        I PDF in «Obsoleti» o «Revisioni precedenti» vanno nello storico; bozze e doppioni vengono saltati. Quelli già nel catalogo con la stessa revisione non si ricaricano.
      </p>
      {!p && <label className="btn" style={{ alignSelf: "flex-start" }}>Scegli la cartella…
        {/* @ts-expect-error webkitdirectory non è nei tipi di React */}
        <input type="file" hidden multiple webkitdirectory="" directory="" onChange={(e) => sceltaCartella(e.target.files)} /></label>}
      {stato && <p className="msg" role="status" style={{ margin: 0 }}>{stato}</p>}
      {p && !lavoro && prog.tot === 0 && (
        <>
          <div className="row">
            <label className="ck"><input type="checkbox" checked={!!tutti} onChange={(e) => setScelti(e.target.checked ? new Set(p.map((x) => x.cartella)) : new Set())} /> tutte</label>
            <label className="ck"><input type="checkbox" checked={storico} onChange={(e) => setStorico(e.target.checked)} /> carica anche le revisioni precedenti (storico)</label>
            <b>Da caricare: {daCaricare.n} PDF, {MB(daCaricare.byte)}</b>
          </div>
          <div className="mx" style={{ maxHeight: "45vh", overflow: "auto" }}>
            <table>
              <thead><tr><th /><th>Macchina / documento</th><th>Nel catalogo</th><th>Lingue (rev)</th></tr></thead>
              <tbody>{p.map((x) => (
                <tr key={x.cartella}>
                  <td><input type="checkbox" checked={scelti.has(x.cartella)} onChange={(e) => { const s = new Set(scelti); if (e.target.checked) s.add(x.cartella); else s.delete(x.cartella); setScelti(s); }} aria-label={"Importa " + x.cartella} /></td>
                  <td>{x.cartella}</td>
                  <td>{x.esistente ? <span>aggiorna «{x.esistente.modello}»</span> : <small>nuova, in «{NUOVA_CAT}»</small>}</td>
                  <td style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{x.perLingua.map((l) => `${l.lingua} ${l.vigore ? "rev" + l.vigore.rev : "solo vecchie"}${l.giaCaricato ? " ✓" : ""}`).join(" · ")}</td>
                </tr>))}</tbody>
            </table>
          </div>
          {scartati.length > 0 && <details><summary>{scartati.length} PDF non importati</summary><ul>{scartati.map((s) => <li key={s.percorso}><small>{s.percorso} — {s.motivo}</small></li>)}</ul></details>}
          <div className="row"><button className="btn" onClick={importa} disabled={!scelti.size}>Importa {scelti.size} voci</button><small>✓ = già nel catalogo con la stessa revisione</small></div>
        </>
      )}
      {prog.tot > 0 && (
        <div>
          <div style={{ height: 10, background: "var(--bg)", borderRadius: 5, overflow: "hidden", border: "1px solid var(--line)" }}>
            <div style={{ width: `${Math.round((prog.byte / Math.max(1, prog.totByte)) * 100)}%`, height: "100%", background: "var(--accent)" }} />
          </div>
          <small>{prog.fatti} di {prog.tot} PDF · {MB(prog.byte)} di {MB(prog.totByte)}{lavoro ? " · non chiudere la pagina" : ""}</small>
        </div>
      )}
      {errori.length > 0 && <details open><summary>Errori ({errori.length})</summary><ul>{errori.map((e, i) => <li key={i}><small>{e}</small></li>)}</ul></details>}
    </div>
  );
}
