import { notFound, redirect } from "next/navigation";
import { utenteCorrente } from "@/lib/dati";

// La fatturazione è la scheda «Da fatturare» del modulo Rapporti d'intervento
export default async function PaginaFatturazioneRapporti() {
  const { supabase } = await utenteCorrente();
  const [{ data: lvFattura }, { data: lvRapporti }] = await Promise.all([
    supabase.rpc("livello_modulo", { p_modulo: "fatturazione-rapporti" }),
    supabase.rpc("livello_modulo", { p_modulo: "rapporti-intervento" }),
  ]);
  if ((lvFattura ?? "nessuno") === "nessuno") notFound();
  if ((lvRapporti ?? "nessuno") === "nessuno") {
    return (
      <header>
        <h1>Fatturazione rapporti d&apos;intervento</h1>
        <p className="sub">Per vedere la coda da fatturare serve anche l&apos;accesso al modulo Rapporti d&apos;intervento (almeno in lettura): chiedilo a un amministratore dalla pagina Permessi.</p>
      </header>
    );
  }
  redirect("/moduli/rapporti-intervento?tab=fat");
}
