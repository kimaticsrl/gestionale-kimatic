import { notFound } from "next/navigation";
import Manuali from "@/moduli/catalogo-manuali/Manuali";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaManuali() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "catalogo-manuali" });
  if (!data || data === "nessuno") notFound();
  return <Manuali livello={data} utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
