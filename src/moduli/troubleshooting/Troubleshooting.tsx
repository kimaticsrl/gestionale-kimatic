"use client";
import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MARKUP } from "./markup";
import "./troubleshooting.css";

type Props = { me: string; modifica: boolean; gestisce: boolean };

export default function Troubleshooting({ me, modifica, gestisce }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let ferma: (() => void) | undefined;
    let annullato = false;
    (async () => {
      const [{ avvia }, { creaDb, creaFile }] = await Promise.all([import("./app.js"), import("./dati.js")]);
      if (annullato || !root.current) return;
      const supabase = supabaseBrowser();
      ferma = avvia(root.current, { me, modifica, gestisce, db: creaDb(supabase), files: creaFile(supabase) });
    })();
    return () => { annullato = true; ferma?.(); };
  }, [me, modifica, gestisce]);
  return <div className="ts" ref={root} dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
