import { notFound } from "next/navigation";
import ControlloGestione from "@/moduli/controllo-gestione/ControlloGestione";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaControlloGestione() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "controllo-gestione" });
  if (!data || data === "nessuno") notFound();
  return <ControlloGestione livello={data} utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
