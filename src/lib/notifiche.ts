import "server-only";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { preparaPlanning } from "./planningMail";

/* Spedizione delle notifiche in coda (tabella «notifiche») con la Gmail del gestionale.
   Variabili su Vercel: GMAIL_USER, GMAIL_APP_PASSWORD (password per le app di Google),
   SUPABASE_SECRET_KEY (chiave segreta / service_role di Supabase), CRON_SECRET. */

const SITO = process.env.SITO_URL || "https://gestionale-kimatic.vercel.app";

export function configurate() {
  const manca = ["GMAIL_USER", "GMAIL_APP_PASSWORD", "SUPABASE_SECRET_KEY"].filter((k) => !process.env[k]);
  return manca;
}

function servizio() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function html(testo: string, link: string | null) {
  const corpo = esc(testo).replace(/\n/g, "<br>");
  const bottone = link ? `<p style="margin:24px 0 0"><a href="${esc(SITO + link)}" style="background:#0b1b4d;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">Apri nel gestionale</a></p>` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;max-width:600px">
<p style="margin:0 0 16px;font-size:12px;color:#666">Gestionale Kimatic · notifica automatica</p>
<div>${corpo}</div>${bottone}
<p style="margin:28px 0 0;font-size:12px;color:#888">Questa mail è inviata dal gestionale: non rispondere a questo indirizzo. Gli amministratori scelgono chi riceve le notifiche nella pagina «Notifiche».</p></div>`;
}

type Notifica = { id: number; oggetto: string; testo: string; link: string | null; destinatari: string[] };

/** Prepara (se richiesto) il riepilogo scadenze e spedisce tutte le notifiche in coda. */
export async function spedisci({ scadenze = false } = {}) {
  const manca = configurate();
  if (manca.length) return { inviate: 0, errori: 0, scadenze: 0, manca };
  const sb = servizio();
  let nScad = 0;
  let planning: { planning: number; senzaMail: string[] } | { errore: string } | null = null;
  if (scadenze) {
    const oggi = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
    const { data, error } = await sb.rpc("genera_scadenze", { p_giorno: oggi });
    if (error) throw new Error("Scadenze: " + error.message);
    nScad = (data as number) ?? 0;
    // mail del Planning giornaliero (responsabili, ritardi, piano della settimana): un errore qui non ferma le altre
    try { planning = await preparaPlanning(sb, oggi); } catch (e) { planning = { errore: e instanceof Error ? e.message : "errore" }; }
  }
  const { data, error } = await sb.rpc("notifiche_da_inviare");
  if (error) throw new Error("Coda notifiche: " + error.message);
  const coda = (data ?? []) as Notifica[];
  if (!coda.length) return { inviate: 0, errori: 0, scadenze: nScad, planning, manca };

  const posta = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
  });
  let inviate = 0, errori = 0;
  for (const n of coda) {
    try {
      await posta.sendMail({
        from: { name: "Gestionale Kimatic", address: process.env.GMAIL_USER! },
        // destinatari in copia nascosta: nessuno vede gli indirizzi degli altri
        to: { name: "Gestionale Kimatic", address: process.env.GMAIL_USER! },
        bcc: n.destinatari,
        subject: n.oggetto,
        text: n.testo + (n.link ? `\n\nApri nel gestionale: ${SITO}${n.link}` : ""),
        html: html(n.testo, n.link),
      });
      await sb.rpc("notifica_esito", { p_id: n.id, p_errore: null });
      inviate++;
    } catch (e) {
      await sb.rpc("notifica_esito", { p_id: n.id, p_errore: e instanceof Error ? e.message.slice(0, 500) : "errore" });
      errori++;
    }
  }
  return { inviate, errori, scadenze: nScad, planning, manca };
}
