"use client";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const LOGHI = [
  { id: "kimatic", nome: "Kimatic", dove: "Menu laterale e pagina di accesso, PDF di Organigramma della sicurezza, Sicurezza e formazione, Non conformità, Tesserino trasferta." },
  { id: "bmtek", nome: "BMTEK", dove: "Rapporti d'intervento: modulo firmato dal cliente, report ore, riepilogo addebiti e intestazione del modulo." },
];

// Ridimensiona a massimo 1200 px di lato e salva sempre in PNG (i PDF lo usano così); la trasparenza resta
function prepara(f: File): Promise<{ tipo: string; dati: string }> {
  return new Promise((ok, ko) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1200 / Math.max(im.width || 600, im.height || 600)), c = document.createElement("canvas");
      c.width = Math.round((im.width || 600) * k); c.height = Math.round((im.height || 600) * k);
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(im.src);
      ok({ tipo: "image/png", dati: c.toDataURL("image/png").split(",")[1] });
    };
    im.onerror = () => ko(new Error("Il file non è un'immagine leggibile"));
    im.src = URL.createObjectURL(f);
  });
}

export default function Loghi() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [ver, setVer] = useState(() => Date.now());
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  async function carica(id: string, f?: File) {
    if (!f) return;
    try {
      const { tipo, dati } = await prepara(f);
      const { error } = await sb.from("loghi").upsert({ id, tipo, dati });
      if (error) throw error;
      setMsg({ t: "Logo aggiornato. Nelle altre pagine compare entro un minuto (ricaricale)." }); setVer(Date.now());
    } catch (e) { setMsg({ t: "Logo non salvato: " + (e as Error).message, err: true }); }
  }
  async function originale(id: string) {
    if (!confirm("Tornare al logo originale?")) return;
    const { error } = await sb.from("loghi").delete().eq("id", id);
    if (error) { setMsg({ t: "Non riuscito: " + error.message, err: true }); return; }
    setMsg({ t: "Ripristinato il logo originale." }); setVer(Date.now());
  }

  return (
    <>
      {msg && <div className={"msg" + (msg.err ? " err" : "")}>{msg.t}</div>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {LOGHI.map((l) => (
          <div key={l.id} className="box" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2>{l.nome}</h2>
            <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: 12, overflow: "hidden", boxSizing: "border-box" }}>
              {/* misure esplicite: dentro una griglia l'altezza in % non limitava l'immagine */}
              <img src={`/logo/${l.id}?v=${ver}`} alt={"Logo " + l.nome} style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: 114, objectFit: "contain" }} />
            </div>
            <p className="tag" style={{ margin: 0 }}>Dove si usa: {l.dove}</p>
            <div className="row">
              <label className="btn" style={{ cursor: "pointer" }}>Carica un nuovo logo
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { carica(l.id, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <button className="btn sec" onClick={() => originale(l.id)}>Torna all&apos;originale</button>
            </div>
          </div>
        ))}
      </div>
      <p className="tag">Meglio un PNG con sfondo trasparente, largo almeno 600 px. I loghi dentro i modelli Word (Offerte BMTEK, Lettere d&apos;impegno) fanno parte dei modelli e non cambiano da qui.</p>
    </>
  );
}
