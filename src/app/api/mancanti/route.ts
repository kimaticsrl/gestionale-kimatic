import { NextResponse, type NextRequest } from "next/server";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { daVista, daEstrazione, daCelle, daOp } from "@/moduli/mancanti/sam";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Invio automatico dei mancanti dal PC dell'ufficio (programma «InviaMancanti»).
   POST con «Authorization: Bearer <MANCANTI_TOKEN>», corpo JSON (anche gzip):
   { formato: "vista" | "estrazione" | "celle" | "op", file?: string, righe: [ {colonne di SAM} ] }
   Il caricamento a mano dal modulo non passa da qui (legge il file nel browser). */
export async function POST(req: NextRequest) {
  const token = process.env.MANCANTI_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ errore: "non autorizzato" }, { status: 401 });
  if (!process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ errore: "manca SUPABASE_SECRET_KEY" }, { status: 500 });
  let corpo: { formato?: string; file?: string; righe?: Record<string, unknown>[] };
  try {
    let buf = Buffer.from(await req.arrayBuffer());
    if (req.headers.get("content-encoding") === "gzip" || (buf[0] === 0x1f && buf[1] === 0x8b)) buf = gunzipSync(buf);
    corpo = JSON.parse(buf.toString("utf8").replace(/^﻿/, ""));
  } catch { return NextResponse.json({ errore: "contenuto non leggibile" }, { status: 400 }); }
  const righe = Array.isArray(corpo.righe) ? corpo.righe : [];
  if (corpo.formato === "op") {
    const ops = daOp(righe);
    if (!ops.length) return NextResponse.json({ errore: "nessuna OP" }, { status: 400 });
    const sb0 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb0.rpc("importa_op", { p_op: ops });
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });
    return NextResponse.json({ righe: data });
  }
  const L = corpo.formato === "estrazione" ? daEstrazione(righe) : corpo.formato === "celle" ? daCelle(righe) : daVista(righe);
  if (!L.length) return NextResponse.json({ errore: "nessuna riga di mancanti" }, { status: 400 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("importa_mancanti", { p_righe: L, p_origine: corpo.formato === "celle" ? "Invio automatico (celle)" : "Invio automatico", p_file: corpo.file || "" });
  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });
  return NextResponse.json(data);
}
