import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { spedisci } from "@/lib/notifiche";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ogni mattina (Vercel Cron, vedi vercel.json): riepilogo scadenze + coda
export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto || req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "non autorizzato" }, { status: 401 });
  }
  try { return NextResponse.json(await spedisci({ scadenze: true })); }
  catch (e) { return NextResponse.json({ errore: e instanceof Error ? e.message : "errore" }, { status: 500 }); }
}

// Subito dopo un evento (NC inserita, rapporto firmato…): qualsiasi utente collegato
// può chiedere di spedire ciò che è già in coda
export async function POST() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ errore: "non collegato" }, { status: 401 });
  try { return NextResponse.json(await spedisci()); }
  catch (e) { return NextResponse.json({ errore: e instanceof Error ? e.message : "errore" }, { status: 500 }); }
}
