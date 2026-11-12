import { notFound } from "next/navigation";
import Rapporti from "@/moduli/rapporti/Rapporti";
import { utenteCorrente, type Livello } from "@/lib/dati";

export default async function PaginaRapporti() {
  const { supabase, user, profilo } = await utenteCorrente();
  const [{ data }, { data: lvClienti }] = await Promise.all([
    supabase.rpc("livello_modulo", { p_modulo: "rapporti-intervento" }),
    supabase.rpc("livello_modulo", { p_modulo: "anagrafica-clienti" }),
  ]);
  const livello = (data ?? "nessuno") as Livello;
  if (livello === "nessuno") notFound();
  return <Rapporti me={user.id} nome={profilo?.nome || ""} modifica={livello === "modifica" || livello === "gestisce"} gestisce={livello === "gestisce"} clienti={lvClienti === "gestisce"} />;
}
