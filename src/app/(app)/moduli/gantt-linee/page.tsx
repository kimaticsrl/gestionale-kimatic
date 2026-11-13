import { notFound } from "next/navigation";
import Piano from "@/moduli/piano-produzione/Piano";
import { utenteCorrente } from "@/lib/dati";
import NonAttivo from "@/moduli/piano-produzione/NonAttivo";

// Gantt delle linee per clienti e schermi: è la scheda «Cliente e TV» del Piano produzione, in sola lettura.
export default async function PaginaGantt() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "gantt-linee" });
  if (!data || data === "nessuno") notFound();
  const { data: m } = await supabase.from("moduli").select("migrato,link_attuale").eq("id", "gantt-linee").maybeSingle();
  if (!m?.migrato) return <NonAttivo nome="Gantt linee produzione" link={m?.link_attuale ?? null} />;
  return <Piano livello={data} ruoli={[]} soloCliente
    utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
