import GrigliaPermessi from "@/components/GrigliaPermessi";
import { soloAdmin, type Livello } from "@/lib/dati";

export default async function Permessi() {
  const { supabase } = await soloAdmin();
  const [{ data: ruoli }, { data: moduli }, { data: reparti }, { data: permessi }] = await Promise.all([
    supabase.from("ruoli").select("id,nome").order("ordine"),
    supabase.from("moduli").select("id,nome,reparto_id").order("ordine"),
    supabase.from("reparti").select("id,sigla"),
    supabase.from("permessi").select("ruolo_id,modulo_id,livello"),
  ]);
  const sigla = Object.fromEntries((reparti ?? []).map((r) => [r.id, r.sigla]));
  const iniziale: Record<string, Livello> = {};
  (permessi ?? []).forEach((p) => { iniziale[`${p.ruolo_id}|${p.modulo_id}`] = p.livello; });
  return (
    <>
      <header>
        <h1>Permessi</h1>
        <p className="sub">Cosa può fare ogni ruolo in ogni modulo. Chi ha più ruoli ottiene il livello più alto. Gli amministratori gestiscono sempre tutto.</p>
      </header>
      <GrigliaPermessi ruoli={ruoli ?? []} iniziale={iniziale}
        moduli={(moduli ?? []).map((m) => ({ id: m.id, nome: m.nome, sigla: sigla[m.reparto_id] ?? "" }))} />
    </>
  );
}
