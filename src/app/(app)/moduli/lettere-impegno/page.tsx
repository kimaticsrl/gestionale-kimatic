import { notFound } from "next/navigation";
import LettereImpegno from "@/moduli/lettere-impegno/LettereImpegno";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaLettere() {
  const { supabase } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "lettere-impegno" });
  if (!data || data === "nessuno") notFound();
  return <LettereImpegno gestisce={data === "gestisce"} />;
}
