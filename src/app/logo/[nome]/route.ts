// Logo aziendale: quello caricato dalla pagina «Loghi» o, se non c'è, l'originale in public/.
// Pubblico (serve anche alla pagina di accesso). Uso: /logo/kimatic, /logo/bmtek
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";

const ORIGINALI: Record<string, string> = { kimatic: "logo-kimatic.png", bmtek: "logo-bmtek.png" };

export async function GET(_req: Request, { params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  if (!ORIGINALI[nome]) return new Response("Non trovato", { status: 404 });
  const headers = { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" };
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.from("loghi").select("tipo,dati").eq("id", nome).maybeSingle();
    if (data?.dati) return new Response(Buffer.from(data.dati, "base64"), { headers: { ...headers, "Content-Type": data.tipo } });
  } catch { /* tabella non ancora creata: si usa l'originale */ }
  const file = await readFile(path.join(process.cwd(), "public", ORIGINALI[nome]));
  return new Response(file, { headers: { ...headers, "Content-Type": "image/png" } });
}
