import { notFound } from "next/navigation";
import OfferteBmtek from "@/moduli/offerte-bmtek/OfferteBmtek";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaOfferte() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "offerte-bmtek" });
  if (!data || data === "nessuno") notFound();
  return <OfferteBmtek livello={data} utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
