// Pagina del Piano produzione (anche per il modulo Gantt linee produzione).
// Sta nella cartella privata del progetto e si scarica solo dopo l'accesso,
// e solo da chi ha almeno il livello «Legge» su uno dei due moduli.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";

const BASE = path.join(process.cwd(), "privato", "piano");

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Accesso richiesto", { status: 401 });
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.rpc("livello_modulo", { p_modulo: "piano-produzione" }),
    supabase.rpc("livello_modulo", { p_modulo: "gantt-linee" }),
  ]);
  if ((!a || a === "nessuno") && (!b || b === "nessuno")) return new Response("Non autorizzato", { status: 403 });

  const { path: parti } = await params;
  const file = path.normalize(path.join(BASE, ...parti));
  if (!file.startsWith(BASE + path.sep) || !file.endsWith(".html")) return new Response("Percorso non valido", { status: 400 });
  try {
    const dati = await readFile(file);
    return new Response(dati, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache", "X-Frame-Options": "SAMEORIGIN" },
    });
  } catch {
    return new Response("Non trovato", { status: 404 });
  }
}
