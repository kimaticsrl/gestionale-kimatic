import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Lettura automatica dello scontrino (Note spese) con Claude.
   POST { immagine: "data:image/jpeg;base64,…" } → { importo, valuta, data, esercente, categoria, carta4, pagamento }
   GET → { attivo } (c'è la chiave ANTHROPIC_API_KEY su Vercel?) */
const MODELLO = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const CATEGORIE = ["ristorante", "albergo", "carburante", "pedaggi", "parcheggio", "viaggio", "taxi", "noleggio", "materiale", "altro"];

const ISTRUZIONI = `Sei l'assistente delle note spese di un'azienda italiana. Ricevi la foto di uno scontrino, una ricevuta o una fattura di una spesa di trasferta (Italia o estero).
Rispondi SOLO con un oggetto JSON, senza altro testo, con queste chiavi:
- "importo": numero, il TOTALE pagato (IVA inclusa, mance comprese se pagate), con il punto come separatore decimale; null se non leggibile
- "valuta": codice ISO 4217 a 3 lettere (EUR, USD, CHF, GBP, PLN…), dedotto da simboli, testo o paese dello scontrino; null se non deducibile
- "data": data della spesa nel formato AAAA-MM-GG; null se non leggibile
- "esercente": nome breve dell'esercente (es. "Pepesale", "Esso", "Hotel Roma"); null se non leggibile
- "categoria": una tra ${CATEGORIE.map((c) => `"${c}"`).join(", ")} (ristorante = pasti e bar; viaggio = treno, aereo, traghetto; taxi = taxi e mezzi pubblici; materiale = acquisti di materiale)
- "carta4": le ultime 4 cifre della carta di pagamento se stampate (es. "**** 4821" → "4821"); null se assenti
- "pagamento": "carta" se pagato con carta/bancomat/POS, "contanti" se in contanti, null se non indicato
Non inventare: se un dato non si legge, metti null.`;

async function puoUsarla() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const { data } = await sb.rpc("livello_modulo", { p_modulo: "note-spese" });
  return data === "modifica" || data === "gestisce";
}

export async function GET() {
  return NextResponse.json({ attivo: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ errore: "lettura automatica non attiva" }, { status: 503 });
  if (!(await puoUsarla())) return NextResponse.json({ errore: "non autorizzato" }, { status: 401 });
  const { immagine } = (await req.json().catch(() => ({}))) as { immagine?: string };
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(immagine || "");
  if (!m) return NextResponse.json({ errore: "immagine non valida" }, { status: 400 });
  if (m[2].length > 7_000_000) return NextResponse.json({ errore: "immagine troppo grande" }, { status: 413 });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODELLO, max_tokens: 400, system: ISTRUZIONI,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
        { type: "text", text: "Leggi questo scontrino e rispondi con il JSON." },
      ] }],
    }),
    signal: AbortSignal.timeout(45000),
  }).catch((e) => ({ ok: false, status: 504, text: async () => String(e) }) as unknown as Response);
  if (!r.ok) {
    const t = await r.text();
    const msg = r.status === 401 ? "chiave API non valida" : r.status === 429 ? "troppe richieste, riprova tra poco"
      : /credit|billing/i.test(t) ? "credito Anthropic esaurito" : "servizio non disponibile";
    return NextResponse.json({ errore: msg }, { status: 502 });
  }
  const j = (await r.json()) as { content?: { type: string; text?: string }[] };
  const testo = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  let x: Record<string, unknown> = {};
  try { x = JSON.parse((/\{[\s\S]*\}/.exec(testo) || ["{}"])[0]); } catch { /* risposta non leggibile */ }

  const importo = typeof x.importo === "number" && x.importo > 0 ? Math.round(x.importo * 100) / 100 : null;
  const valuta = typeof x.valuta === "string" && /^[A-Z]{3}$/.test(x.valuta.toUpperCase()) ? x.valuta.toUpperCase() : null;
  const data = typeof x.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.data) ? x.data : null;
  const esercente = typeof x.esercente === "string" ? x.esercente.trim().slice(0, 80) || null : null;
  const categoria = typeof x.categoria === "string" && CATEGORIE.includes(x.categoria) ? x.categoria : null;
  const carta4 = typeof x.carta4 === "string" && /^\d{4}$/.test(x.carta4.replace(/\D/g, "").slice(-4)) ? x.carta4.replace(/\D/g, "").slice(-4) : null;
  const pagamento = x.pagamento === "carta" || x.pagamento === "contanti" ? x.pagamento : null;
  return NextResponse.json({ importo, valuta, data, esercente, categoria, carta4, pagamento });
}
