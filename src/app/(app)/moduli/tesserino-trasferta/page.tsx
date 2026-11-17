import { notFound } from "next/navigation";
import TesserinoTrasferta from "@/moduli/tesserino-trasferta/TesserinoTrasferta";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaTesserino() {
  const { supabase } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "tesserino-trasferta" });
  if (!data || data === "nessuno") notFound();
  return <TesserinoTrasferta livello={data} />;
}
