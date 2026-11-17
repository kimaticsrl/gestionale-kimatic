// File dei moduli Rateizzazioni fiscali, Piano di rientro fornitori e Tesserino trasferta.
// Sono nella cartella privata del progetto e si scaricano
// solo dopo l'accesso, e solo da chi ha almeno il livello «Legge» sul modulo.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";

// modulo → cartella in privato/
const CARTELLE: Record<string, string> = {
  "rateizzazioni": "rateizzazioni",
  "rientro-fornitori": "rientro",
  "tesserino-trasferta": "tesserino",
};
const TIPI: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
};

export async function GET(_req: Request, { params }: { params: Promise<{ modulo: string; path: string[] }> }) {
  const { modulo, path: parti } = await params;
  const cartella = CARTELLE[modulo];
  if (!cartella) return new Response("Non trovato", { status: 404 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Accesso richiesto", { status: 401 });
  const { data: livello } = await supabase.rpc("livello_modulo", { p_modulo: modulo });
  if (!livello || livello === "nessuno") return new Response("Non autorizzato", { status: 403 });

  const BASE = path.join(process.cwd(), "privato", cartella);
  const file = path.normalize(path.join(BASE, ...parti));
  if (!file.startsWith(BASE + path.sep)) return new Response("Percorso non valido", { status: 400 });
  try {
    const dati = await readFile(file);
    return new Response(dati, {
      headers: {
        "Content-Type": TIPI[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": file.endsWith(".html") ? "private, no-cache" : "private, max-age=3600",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return new Response("Non trovato", { status: 404 });
  }
}
