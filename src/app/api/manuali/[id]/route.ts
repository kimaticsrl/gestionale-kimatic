// Apre un PDF del Catalogo manuali: controlla l'accesso e rimanda a un link temporaneo dell'archivio
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("File non valido", { status: 400 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Accesso richiesto", { status: 401 });
  const { data, error } = await supabase.storage.from("manuali").createSignedUrl(`${id}.pdf`, 600);
  if (error || !data) return new Response("Manuale non trovato o non autorizzato", { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
