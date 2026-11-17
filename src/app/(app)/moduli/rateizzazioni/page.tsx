import { notFound } from "next/navigation";
import Rateizzazioni from "@/moduli/rateizzazioni/Rateizzazioni";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaRateizzazioni() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "rateizzazioni" });
  if (!data || data === "nessuno") notFound();
  return <Rateizzazioni livello={data} utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
