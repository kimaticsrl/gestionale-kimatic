"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { soloAdmin, utenteCorrente, type Livello } from "@/lib/dati";

export async function esci() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

// «Vedi come»: l'amministratore usa il gestionale con i soli permessi di un ruolo (null = torna amministratore)
export async function simula(ruolo: string | null): Promise<string | null> {
  const { supabase, profilo } = await utenteCorrente();
  if (!profilo?.is_admin || !profilo.attivo) return "Solo gli amministratori possono cambiare vista.";
  const { error } = await supabase.rpc("simula_ruolo", { p_ruolo: ruolo || null });
  if (error) {
    // (gli errori lanciati qui arriverebbero nascosti: si restituisce il messaggio)
    if (error.code === "PGRST202" || /simula_ruolo/.test(error.message))
      return "Manca la migrazione 0043 (Vedi come): lanciala nell'SQL Editor di Supabase.";
    return error.message;
  }
  revalidatePath("/", "layout");
  return null;
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

// ---------- Notifiche (pagina «Notifiche», solo amministratori) ----------
export async function salvaRegolaNotifica(evento: string, campi: { attivo?: boolean; ruoli?: string[]; persone?: string[]; email_extra?: string[]; anticipi?: number[] }): Promise<string | null> {
  const { supabase } = await soloAdmin();
  const { error } = await supabase.from("notifiche_regole").update(campi).eq("evento", evento);
  if (error) return "Non salvato: " + error.message;
  revalidatePath("/admin/notifiche");
  return null;
}

export async function provaNotifiche(): Promise<string | null> {
  const { supabase } = await soloAdmin();
  const { error } = await supabase.rpc("notifica_prova");
  if (error) return "Prova non riuscita: " + error.message;
  return spedisciOra(false);
}

export async function spedisciOra(scadenze = true): Promise<string | null> {
  await soloAdmin();
  const { spedisci } = await import("@/lib/notifiche");
  try {
    const r = await spedisci({ scadenze });
    if (r.manca.length) return "Notifica in coda, ma le mail non partono: su Vercel mancano " + r.manca.join(", ") + ".";
    if (r.errori) return `Spedite ${r.inviate}, non spedite ${r.errori}: guarda «Ultime notifiche» per il motivo.`;
    return null;
  } catch (e) { return e instanceof Error ? e.message : "Errore nella spedizione"; }
}
