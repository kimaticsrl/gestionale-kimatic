"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Pagine larghe: il menu a sinistra parte nascosto per lasciare spazio ai dati
const AMPIE = ["/moduli/mancanti-montaggi"];

/** Pulsante per nascondere o mostrare la colonna del menu a sinistra. La scelta resta sul dispositivo. */
export default function MenuLaterale() {
  const path = usePathname();
  const ampia = AMPIE.some((p) => path.startsWith(p));
  const [chiuso, setChiuso] = useState(false);
  useEffect(() => {
    let v = false;
    try { v = localStorage.getItem(ampia ? "menu-ampie" : "menu") !== "aperto" && (ampia || localStorage.getItem("menu") === "chiuso"); } catch { /* niente */ }
    setChiuso(v);
  }, [ampia]);
  useEffect(() => {
    if (chiuso) document.documentElement.dataset.menu = "chiuso"; else delete document.documentElement.dataset.menu;
  }, [chiuso]);
  const cambia = () => {
    const v = !chiuso; setChiuso(v);
    try { if (ampia) localStorage.setItem("menu-ampie", v ? "chiuso" : "aperto"); else localStorage.setItem("menu", v ? "chiuso" : "aperto"); } catch { /* niente */ }
  };
  return (
    <button type="button" className="menu-lat" onClick={cambia} aria-expanded={!chiuso} title={chiuso ? "Mostra il menu" : "Nascondi il menu per avere più spazio"}>
      {chiuso ? "☰ Menu" : "«"}
    </button>
  );
}
