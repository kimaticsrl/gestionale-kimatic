import { notFound } from "next/navigation";
import { Riquadro } from "@/moduli/riquadro";
import { utenteCorrente } from "@/lib/dati";

// Pagina statica: per cambiare nomi o ruoli si modifica privato/organigramma/index.html.
export default async function PaginaOrganigramma() {
  const { supabase } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "organigramma-sicurezza" });
  if (!data || data === "nessuno") notFound();
  return <Riquadro modulo="organigramma-sicurezza" titolo="Organigramma della sicurezza" />;
}
