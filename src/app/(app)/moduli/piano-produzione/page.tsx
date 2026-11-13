import { notFound } from "next/navigation";
import Piano from "@/moduli/piano-produzione/Piano";
import { utenteCorrente } from "@/lib/dati";
import NonAttivo from "@/moduli/piano-produzione/NonAttivo";

export default async function PaginaPiano() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "piano-produzione" });
  if (!data || data === "nessuno") notFound();
  const { data: m } = await supabase.from("moduli").select("migrato,link_attuale").eq("id", "piano-produzione").maybeSingle();
  if (!m?.migrato) return <NonAttivo nome="Piano produzione" link={m?.link_attuale ?? null} />;
  const { data: r } = await supabase.from("profilo_ruoli").select("ruolo_id").eq("profilo_id", user.id);
  return <Piano livello={data} ruoli={(r ?? []).map((x: { ruolo_id: string }) => x.ruolo_id)}
    utente={{ id: user.id, nome: profilo?.nome ?? "", email: user.email ?? "" }} />;
}
