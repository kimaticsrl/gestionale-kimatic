import { notFound } from "next/navigation";
import Costificatore from "@/moduli/costificatore/Costificatore";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaCostificatore() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "costificatore" });
  if (!data || data === "nessuno") notFound();
  return <Costificatore livello={data} utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
