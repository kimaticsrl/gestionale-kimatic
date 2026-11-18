import { notFound } from "next/navigation";
import Mancanti from "@/moduli/mancanti/Mancanti";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaMancanti() {
  const { supabase, user } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "mancanti-montaggi" });
  if (!data || data === "nessuno") notFound();
  return <Mancanti me={user.id} gestisce={data === "gestisce"} modifica={data === "modifica" || data === "gestisce"} />;
}
