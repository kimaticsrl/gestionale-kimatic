// File del modulo Lettere d'impegno (pagina con il modello Word).
// Sono nella cartella privata del progetto e si scaricano solo dopo l'accesso,
// e solo da chi ha almeno il livello «Legge» sul modulo.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";

const BASE = path.join(process.cwd(), "privato", "lettere");
const TIPI: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".json": "application/json", ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
};

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Accesso richiesto", { status: 401 });
  const { data: livello } = await supabase.rpc("livello_modulo", { p_modulo: "lettere-impegno" });
  if (!livello || livello === "nessuno") return new Response("Non autorizzato", { status: 403 });

  const { path: parti } = await params;
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
