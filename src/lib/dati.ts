import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export * from "./livelli";

export type Profilo = { id: string; email: string; nome: string; is_admin: boolean; attivo: boolean };

/** Utente collegato con il suo profilo; se manca, torna al login. */
export async function utenteCorrente() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profilo } = await supabase.from("profili").select("*").eq("id", user.id).single<Profilo>();
  return { supabase, user, profilo };
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
  if (!ctx.profilo?.is_admin || !ctx.profilo.attivo) redirect("/");
  return ctx;
}
