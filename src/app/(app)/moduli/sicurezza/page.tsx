import { notFound } from "next/navigation";
import Sicurezza from "@/components/Sicurezza";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaSicurezza() {
  const { supabase } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "sicurezza" });
  if (!data || data === "nessuno") notFound();
  return <Sicurezza modifica={data === "modifica" || data === "gestisce"} />;
}
