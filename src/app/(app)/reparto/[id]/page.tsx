import { notFound } from "next/navigation";
import Moduli, { type Modulo, type Reparto } from "@/components/Moduli";
import { utenteCorrente } from "@/lib/dati";

export default async function PaginaReparto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await utenteCorrente();
  const [{ data: reparto }, { data: moduli }] = await Promise.all([
    supabase.from("reparti").select("id,nome,sigla").eq("id", id).maybeSingle<Reparto>(),
    supabase.rpc("miei_moduli"),
  ]);
  if (!reparto) notFound();
  const lista = ((moduli ?? []) as Modulo[]).filter((m) => m.reparto_id === id);
  return (
    <>
      <header><h1>{reparto.nome}</h1></header>
      <Moduli moduli={lista} reparti={[reparto]} />
    </>
  );
}
