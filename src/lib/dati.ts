import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export * from "./livelli";

export type Profilo = { id: string; email: string; nome: string; is_admin: boolean; attivo: boolean };

/** Utente collegato con il suo profilo; se manca, torna al login. */
export async function utenteCorrente() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: prof }, { data: sim }, { data: attivo }] = await Promise.all([
    supabase.from("profili").select("*").eq("id", user.id).single<Profilo>(),
    supabase.rpc("ruolo_simulato"),
    supabase.rpc("utente_attivo"),
  ]);
  // attivo: disattivato dalla pagina Utenti o cessato nell'Anagrafica dipendenti
  const profilo = prof ? { ...prof, attivo: prof.attivo && attivo !== false } : prof;
  // «Vedi come»: ruolo che l'amministratore sta simulando (null = nessuno)
  const simulato = profilo?.is_admin && typeof sim === "string" && sim ? sim : null;
  return { supabase, user, profilo, simulato };
}

/** Ruolo Direzione (attivo): l'unico che vede e scarica il backup. */
export async function diDirezione(supabase: Awaited<ReturnType<typeof utenteCorrente>>["supabase"]) {
  const { data } = await supabase.rpc("di_direzione");
  return data === true;
}

export async function soloDirezione() {
  const ctx = await utenteCorrente();
  if (!(await diDirezione(ctx.supabase))) redirect("/");
  return ctx;
}

export async function soloAdmin() {
  const ctx = await utenteCorrente();
  if (!ctx.profilo?.is_admin || !ctx.profilo.attivo || ctx.simulato) redirect("/");
  return ctx;
}
