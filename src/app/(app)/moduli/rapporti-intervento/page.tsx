import { notFound } from "next/navigation";
import Rapporti from "@/moduli/rapporti/Rapporti";
import { utenteCorrente, type Livello } from "@/lib/dati";

export default async function PaginaRapporti() {
  const { supabase, user } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "rapporti-intervento" });
  const livello = (data ?? "nessuno") as Livello;
  if (livello === "nessuno") notFound();
  return <Rapporti me={user.id} modifica={livello === "modifica" || livello === "gestisce"} gestisce={livello === "gestisce"} />;
}
