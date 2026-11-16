import { notFound } from "next/navigation";
import Piano from "@/moduli/piano-produzione/Piano";
import { utenteCorrente } from "@/lib/dati";

// Pagina per gli operativi: solo «File commesse Kimatic» e «Planning giornaliero» del Piano produzione, in sola lettura.
export default async function PaginaCommessePlanning() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "commesse-planning" });
  if (!data || data === "nessuno") notFound();
  return <Piano livello={data} ruoli={[]} schede={["fcm", "plan"]} titolo="Commesse e planning"
    utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
