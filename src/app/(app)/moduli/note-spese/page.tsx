import { notFound } from "next/navigation";
import NoteSpese from "@/moduli/note-spese/NoteSpese";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaNoteSpese() {
  const { supabase, user, profilo } = await utenteCorrente();
  const { data } = await supabase.rpc("livello_modulo", { p_modulo: "note-spese" });
  if (!data || data === "nessuno") notFound();
  return <NoteSpese me={user.id} nome={profilo?.nome ?? ""} gestisce={data === "gestisce"} modifica={data === "modifica" || data === "gestisce"} />;
}
