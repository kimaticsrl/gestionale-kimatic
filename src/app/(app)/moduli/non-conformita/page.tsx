import { notFound } from "next/navigation";
import NonConformita from "@/moduli/non-conformita/NonConformita";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaNonConformita() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "non-conformita" });
  if (!data || data === "nessuno") notFound();
  return <NonConformita me={user.id} nome={profilo?.nome ?? ""} gestisce={data === "gestisce"} modifica={data === "modifica" || data === "gestisce"} />;
}
