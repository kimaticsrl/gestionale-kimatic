import { notFound } from "next/navigation";
import Dipendenti from "@/components/Dipendenti";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaDipendenti() {
  const { supabase } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "anagrafica-dipendenti" });
  if (!data || data === "nessuno") notFound();
  return <Dipendenti modifica={data === "modifica" || data === "gestisce"} />;
}
