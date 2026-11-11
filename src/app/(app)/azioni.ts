"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { soloAdmin, type Livello } from "@/lib/dati";

export async function esci() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

function verifica(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function impostaPermesso(ruolo: string, modulo: string, livello: Livello) {
  const { supabase } = await soloAdmin();
  const { error } = await supabase.from("permessi").upsert({ ruolo_id: ruolo, modulo_id: modulo, livello });
  verifica(error);
  revalidatePath("/", "layout");
}

export async function impostaRuolo(profilo: string, ruolo: string, attivo: boolean) {
  const { supabase } = await soloAdmin();
  const { error } = attivo
    ? await supabase.from("profilo_ruoli").upsert({ profilo_id: profilo, ruolo_id: ruolo })
    : await supabase.from("profilo_ruoli").delete().eq("profilo_id", profilo).eq("ruolo_id", ruolo);
  verifica(error);
  revalidatePath("/admin/utenti");
}

export async function impostaProfilo(profilo: string, campo: "is_admin" | "attivo", valore: boolean) {
  const { supabase } = await soloAdmin();
  const { error } = await supabase.from("profili").update({ [campo]: valore }).eq("id", profilo);
  verifica(error);
  revalidatePath("/admin/utenti");
}

export async function invita(form: FormData) {
  const { supabase, user } = await soloAdmin();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const nome = String(form.get("nome") || "").trim();
  const ruoli = form.getAll("ruoli").map(String);
  const is_admin = form.get("is_admin") === "on";
  if (!email.includes("@")) return;
  const { error } = await supabase.from("inviti").upsert({ email, nome, ruoli, is_admin, invitato_da: user.id });
  verifica(error);
  revalidatePath("/admin/utenti");
}

export async function annullaInvito(email: string) {
  const { supabase } = await soloAdmin();
  const { error } = await supabase.from("inviti").delete().eq("email", email);
  verifica(error);
  revalidatePath("/admin/utenti");
}
