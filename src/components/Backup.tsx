"use client";
import { useState } from "react";
import JSZip from "jszip";
import { supabaseBrowser } from "@/lib/supabase/client";

// Tabelle da salvare, con la colonna per ordinarle (serve a leggerle a pagine da 1000)
const TABELLE: [string, string][] = [
  ["reparti", "id"], ["moduli", "id"], ["ruoli", "id"], ["permessi", "ruolo_id"], ["regole_propri", "modulo_id"],
  ["profili", "id"], ["profilo_ruoli", "profilo_id"], ["inviti", "email"],
  ["clienti", "id"], ["rapporti", "id"], ["fatture_rapporti", "rapporto_id"],
  ["ts_casi", "id"], ["ts_liste", "id"], ["bm_docs", "id"], ["impostazioni", "id"], ["registro_modifiche", "id"],
];
const ARCHIVI = ["troubleshooting"];

export default function Backup() {
  const [foto, setFoto] = useState(true);
  const [stato, setStato] = useState("");
  const [lavoro, setLavoro] = useState(false);

  async function scarica() {
    const sb = supabaseBrowser();
    const zip = new JSZip();
    const riepilogo: Record<string, number> = {};
    setLavoro(true);
    try {
      for (const [t, ord] of TABELLE) {
        setStato(`Copio ${t}…`);
        const righe: unknown[] = [];
        for (let da = 0; ; da += 1000) {
          const { data, error } = await sb.from(t).select("*").order(ord).range(da, da + 999);
          if (error) throw new Error(`${t}: ${error.message}`);
          righe.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        riepilogo[t] = righe.length;
        zip.file(`dati/${t}.json`, JSON.stringify(righe, null, 1));
      }
      if (foto) {
        for (const b of ARCHIVI) {
          const nomi: string[] = [];
          const elenca = async (cartella: string) => {
            for (let da = 0; ; da += 1000) {
              const { data, error } = await sb.storage.from(b).list(cartella, { limit: 1000, offset: da });
              if (error) throw new Error(`${b}: ${error.message}`);
              for (const f of data ?? []) {
                const p = cartella ? `${cartella}/${f.name}` : f.name;
                if (f.id) nomi.push(p); else await elenca(p); // senza id = cartella
              }
              if (!data || data.length < 1000) break;
            }
          };
          await elenca("");
          let n = 0;
          for (const p of nomi) {
            setStato(`Copio le foto di ${b}: ${++n} di ${nomi.length}…`);
            const { data, error } = await sb.storage.from(b).download(p);
            if (error || !data) throw new Error(`${b}/${p}: ${error?.message || "non scaricato"}`);
            zip.file(`file/${b}/${p}`, data);
          }
          riepilogo[`file ${b}`] = nomi.length;
        }
      }
      const quando = new Date();
      zip.file("LEGGIMI.txt", [
        "Backup del Gestionale Kimatic",
        `Creato il ${quando.toLocaleString("it-IT")}`,
        "",
        "dati/  una tabella per file, in formato JSON",
        foto ? "file/  le foto e i documenti caricati nei moduli" : "(foto non incluse)",
        "",
        ...Object.entries(riepilogo).map(([k, v]) => `${k}: ${v}`),
      ].join("\r\n"));
      setStato("Preparo il file…");
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `backup-gestionale-${quando.toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setStato(`Backup scaricato: ${(blob.size / 1048576).toFixed(1)} MB.`);
    } catch (e) {
      setStato("Backup non riuscito: " + (e as Error).message);
    } finally {
      setLavoro(false);
    }
  }

  return (
    <div className="box">
      <h2>Scarica un backup adesso</h2>
      <p className="tag">Un file .zip con tutti i dati del gestionale. Tienilo sul PC o su un disco esterno.</p>
      <label className="ck" style={{ margin: "10px 0" }}>
        <input type="checkbox" checked={foto} onChange={(e) => setFoto(e.target.checked)} /> Includi foto e documenti caricati
      </label>
      <div className="row">
        <button className="btn" onClick={scarica} disabled={lavoro}>{lavoro ? "Backup in corso…" : "Scarica backup"}</button>
        {stato && <span role="status">{stato}</span>}
      </div>
    </div>
  );
}
