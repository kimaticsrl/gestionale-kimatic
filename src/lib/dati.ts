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

export async function soloAdmin() {
  const ctx = await utenteCorrente();
  if (!ctx.profilo?.is_admin || !ctx.profilo.attivo) redirect("/");
  return ctx;
}
