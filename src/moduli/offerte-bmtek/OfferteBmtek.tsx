"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { creaClaude } from "./shim.js";

type Props = { utente: { id: string; nome: string; email: string }; livello: string };

export default function OfferteBmtek({ utente, livello }: Props) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    (window as unknown as { KIMATIC_CLAUDE: unknown }).KIMATIC_CLAUDE = creaClaude({ supabase: supabaseBrowser(), utente, livello });
    setPronto(true);
  }, [utente, livello]);
  if (!pronto) return <div className="empty">Caricamento delle offerte…</div>;
  return (
    <iframe src="/bmtek/index.html" title="Offerte BMTEK"
      style={{ width: "100%", height: "calc(100vh - 56px)", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
  );
}
