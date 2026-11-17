import { notFound } from "next/navigation";
import Organigramma from "@/moduli/organigramma-sicurezza/Organigramma";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaOrganigramma() {
  const { supabase } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "organigramma-sicurezza" });
  if (!data || data === "nessuno") notFound();
  return <Organigramma gestisce={data === "gestisce"} />;
}
