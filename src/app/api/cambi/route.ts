import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/* Cambi BCE (1 € = tasso valuta) di un giorno, per le note spese.
   GET /api/cambi?data=2026-11-17&valute=USD,CHF → { data, data_bce, tassi: { USD: 1.08, CHF: 0.94 } }
   I cambi già letti restano salvati nella tabella «cambi» (sempre uguali anche se la BCE non risponde).
   Fonte: Frankfurter (dati di riferimento BCE); festivi e weekend → ultimo giorno lavorativo prima. */
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

async function bce(data: string, valute: string[]) {
  const qs = `from=EUR&to=${valute.join(",")}`;
  for (const base of ["https://api.frankfurter.dev/v1/", "https://api.frankfurter.app/"]) {
    try {
      const r = await fetch(`${base}${data}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (r.ok) return (await r.json()) as { date: string; rates: Record<string, number> };
    } catch { /* prova l'altro indirizzo */ }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ errore: "non collegato" }, { status: 401 });

  const oggi = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
  let data = req.nextUrl.searchParams.get("data") || oggi;
  if (!RE_DATA.test(data)) return NextResponse.json({ errore: "data non valida" }, { status: 400 });
  if (data > oggi) data = oggi;
  const valute = [...new Set((req.nextUrl.searchParams.get("valute") || "").toUpperCase().split(",").map((v) => v.trim()).filter((v) => /^[A-Z]{3}$/.test(v) && v !== "EUR"))];
  if (!valute.length) return NextResponse.json({ data, data_bce: data, tassi: {} });

  // già salvati
  const { data: salvati } = await sb.from("cambi").select("valuta,tasso,data_bce").eq("data", data).in("valuta", valute);
  const tassi: Record<string, number> = {};
  let dataBce = data;
  for (const c of salvati ?? []) { tassi[c.valuta] = Number(c.tasso); if (c.data_bce) dataBce = c.data_bce; }
  const mancano = valute.filter((v) => !(v in tassi));
  if (mancano.length) {
    const r = await bce(data, mancano);
    if (r) {
      dataBce = r.date;
      const righe = Object.entries(r.rates).map(([valuta, tasso]) => ({ data, valuta, tasso, data_bce: r.date }));
      righe.forEach((x) => { tassi[x.valuta] = x.tasso; });
      // si salvano solo i giorni passati (il cambio di oggi può non essere ancora pubblicato)
      if (data < oggi && righe.length && process.env.SUPABASE_SECRET_KEY) {
        const adm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
        await adm.from("cambi").upsert(righe);
      }
    }
  }
  const senza = valute.filter((v) => !(v in tassi));
  return NextResponse.json({ data, data_bce: dataBce, tassi, ...(senza.length ? { mancano: senza } : {}) });
}
