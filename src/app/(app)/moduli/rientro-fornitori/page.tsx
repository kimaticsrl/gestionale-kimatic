import { notFound } from "next/navigation";
import RientroFornitori from "@/moduli/rientro-fornitori/RientroFornitori";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaRientroFornitori() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "rientro-fornitori" });
  if (!data || data === "nessuno") notFound();
  return <RientroFornitori livello={data} utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
