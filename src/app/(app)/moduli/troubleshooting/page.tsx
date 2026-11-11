import { notFound } from "next/navigation";
import Troubleshooting from "@/moduli/troubleshooting/Troubleshooting";
import { utenteCorrente, type Livello } from "@/lib/dati";

export default async function PaginaTroubleshooting() {
  const { supabase, user } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "troubleshooting" });
  const livello = (data ?? "nessuno") as Livello;
  if (livello === "nessuno") notFound();
  return <Troubleshooting me={user.id} modifica={livello === "modifica" || livello === "gestisce"} gestisce={livello === "gestisce"} />;
}
