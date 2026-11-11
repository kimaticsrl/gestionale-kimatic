import Moduli, { type Modulo, type Reparto } from "@/components/Moduli";
import { utenteCorrente } from "@/lib/dati";

export default async function Home() {
  const { supabase } = await utenteCorrente();
  const [{ data: reparti }, { data: moduli }] = await Promise.all([
    supabase.from("reparti").select("id,nome,sigla").order("ordine"),
    supabase.rpc("miei_moduli"),
  ]);
  return (
    <>
      <header>
        <h1>I tuoi moduli</h1>
        <p className="sub">Accanto a ogni modulo vedi cosa puoi fare: leggere, modificare o gestire.</p>
      </header>
      <Moduli moduli={(moduli ?? []) as Modulo[]} reparti={(reparti ?? []) as Reparto[]} />
    </>
  );
}
