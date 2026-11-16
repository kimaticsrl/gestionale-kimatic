// TEMPORANEO: casi e foto da importare nel Troubleshooting (dalle email del service).
// Solo per chi ha almeno «Modifica» sul Troubleshooting. Da rimuovere dopo l'importazione.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";

const BASE = path.join(process.cwd(), "privato", "ts-import");

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Accesso richiesto", { status: 401 });
  const { data: puo } = await supabase.rpc("puo", { p_modulo: "troubleshooting", p_minimo: "modifica" });
  if (!puo) return new Response("Non autorizzato", { status: 403 });
  const { path: parti } = await params;
  const file = path.normalize(path.join(BASE, ...parti));
  if (!file.startsWith(BASE + path.sep) || !/\.(json|jpg)$/.test(file)) return new Response("Percorso non valido", { status: 400 });
  try {
    const dati = await readFile(file);
    return new Response(dati, { headers: { "Content-Type": file.endsWith(".json") ? "application/json" : "image/jpeg", "Cache-Control": "private, no-store" } });
  } catch {
    return new Response("Non trovato", { status: 404 });
  }
}
