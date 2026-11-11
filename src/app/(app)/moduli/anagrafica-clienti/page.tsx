import { notFound } from "next/navigation";
import Clienti from "@/components/Clienti";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaClienti() {
  const { supabase } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "anagrafica-clienti" });
  if (!data || data === "nessuno") notFound();
  return <Clienti gestisce={data === "gestisce"} />;
}
