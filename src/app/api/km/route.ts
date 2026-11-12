// Km su strada dalla sede Kimatic all'indirizzo di un cliente (sola andata).
// Indirizzi: OpenStreetMap (Nominatim). Percorso: OSRM. Risultati tenuti in memoria per un giorno.
import { supabaseServer } from "@/lib/supabase/server";

const SEDE = "Via Giacomo Matteotti 26, 40057 Cadriano, Granarolo dell'Emilia, Bologna, Italia";
const SEDE_RISERVA = { lat: 44.5477, lon: 11.4125 }; // Cadriano, se la ricerca dell'indirizzo non risponde
const AGENTE = "GestionaleKimatic/1.0 (gestionale interno Kimatic srl)";
const cache = new Map<string, { t: number; v: unknown }>();
const GIORNO = 86_400_000;

type Punto = { lat: number; lon: number; nome: string };

async function cerca(q: string): Promise<Punto | null> {
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ q, format: "jsonv2", limit: "1", "accept-language": "it" });
  const r = await fetch(url, { headers: { "User-Agent": AGENTE } });
  if (!r.ok) return null;
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  return j[0] ? { lat: +j[0].lat, lon: +j[0].lon, nome: j[0].display_name } : null;
}

// Prova l'indirizzo completo, poi via via più corto (a volte il numero civico o la via non si trovano)
async function cercaCliente(indirizzo: string): Promise<Punto | null> {
  const parti = indirizzo.split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < parti.length; i++) {
    const p = await cerca(parti.slice(i).join(", "));
    if (p) return p;
    await new Promise((ok) => setTimeout(ok, 1100)); // Nominatim: al massimo una richiesta al secondo
  }
  return null;
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ errore: "Accesso richiesto" }, { status: 401 });

  const indirizzo = (new URL(req.url).searchParams.get("indirizzo") || "").trim().slice(0, 300);
  if (!indirizzo) return Response.json({ errore: "Indirizzo del cliente mancante" }, { status: 400 });
  const chiave = indirizzo.toLowerCase();
  const c = cache.get(chiave);
  if (c && Date.now() - c.t < GIORNO) return Response.json(c.v);

  try {
    let sede = cache.get("__sede")?.v as Punto | undefined;
    if (!sede) { sede = (await cerca(SEDE)) || { ...SEDE_RISERVA, nome: "Kimatic, Cadriano" }; cache.set("__sede", { t: Date.now(), v: sede }); }
    const dest = await cercaCliente(indirizzo);
    if (!dest) return Response.json({ errore: "indirizzo del cliente non trovato sulla mappa: completalo con città e paese" }, { status: 404 });
    const o = await fetch(`https://router.project-osrm.org/route/v1/driving/${sede.lon},${sede.lat};${dest.lon},${dest.lat}?overview=false`, { headers: { "User-Agent": AGENTE } });
    const j = (await o.json()) as { code: string; routes?: { distance: number; duration: number }[] };
    if (j.code !== "Ok" || !j.routes?.length) return Response.json({ errore: "percorso stradale non trovato" }, { status: 404 });
    const v = { km: Math.round(j.routes[0].distance / 1000), ore: Math.round(j.routes[0].duration / 360) / 10, arrivo: dest.nome };
    cache.set(chiave, { t: Date.now(), v });
    return Response.json(v);
  } catch {
    return Response.json({ errore: "servizio mappe non raggiungibile, riprova più tardi" }, { status: 502 });
  }
}
