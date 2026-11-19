import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Mail del Planning giornaliero (Piano produzione), preparate nel giro del mattino e messe in coda
   nella tabella «notifiche»:
   · planning-responsabili: a ogni responsabile dell'organigramma (config/organigramma) le attività
     di oggi dei collaboratori, chi è assente, e le loro attività in ritardo;
   · planning-ritardi: a ogni persona del Piano le sue attività in ritardo;
   · planning-settimana (il lunedì): a ogni persona il piano della settimana, giorno per giorno.
   Le regole sono quelle del Piano: fasi con persona e date, attività e assenze del planning (agenda). */

type Doc = { id: string; dati: Record<string, unknown> };
type Fase = { s?: string; e?: string; w?: string; t?: { w?: string; s?: string; e?: string }[]; done?: unknown; a?: unknown; h?: number; st?: string };
type Persona = { id: string; name: string; team?: string; k?: string[]; tipo?: string; nota?: unknown; ext?: unknown; att?: boolean; fine?: string };
type Voce = { testo: string; fine?: number };

const FASI: Record<string, { n: string; common?: boolean; office?: boolean }> = {
  "1A": { n: "Technical Data Sheet", common: true }, "1B-M": { n: "Progettazione meccanica" }, "1B-E": { n: "Progettazione elettrica" },
  "2A-M": { n: "Acquisti e produzione meccanica", office: true }, "2A-E": { n: "Acquisti elettrica", office: true },
  "2B": { n: "Controllo qualità e trattamenti" }, "3A": { n: "Preparazione scansie" }, "3B": { n: "Montaggio meccanico e pneumatico" },
  "3A-E": { n: "Prelievo materiale elettrico (QE)" }, "3C-Q": { n: "Cablaggio quadro elettrico" }, "3C-B": { n: "Bordo macchina" },
  "4S": { n: "Start up linea", common: true }, "4A": { n: "Testing (collaudo)", common: true }, "4B": { n: "F.A.T.", common: true }, "5A": { n: "Imballaggio e carico linea", common: true },
  "5B": { n: "Installazione linea", common: true },
};
const ASSENZE = ["Ferie", "Permesso", "Malattia", "Assente"];
const RITARDO_MAX = 45; // come nel Piano: oltre, la fase è «da chiudere», non più un ritardo
const GG = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

const d2n = (s?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null; };
const n2s = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
const fm = (n: number) => { const s = n2s(n); return `${s.slice(8)}/${s.slice(5, 7)}`; };
const dow = (n: number) => (((n + 3) % 7) + 7) % 7;
const giorno = (n: number) => `${GG[dow(n)]} ${fm(n)}`;
const fatta = (p?: Fase) => !!(p && (p.done || p.a));
const nomeKey = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

function pasqua(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = (h + l - 7 * m + 114) % 31 + 1;
  return Date.UTC(y, mo - 1, da) / 864e5;
}
function festivo(n: number) {
  const y = new Date(n * 864e5).getUTCFullYear();
  const F = [[0, 1], [0, 6], [3, 25], [4, 1], [5, 2], [7, 15], [10, 1], [11, 8], [11, 25], [11, 26]].map(([m, d]) => Date.UTC(y, m, d) / 864e5);
  return F.includes(n) || n === pasqua(y) + 1;
}

async function tutti(sb: SupabaseClient, coll: string): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await sb.from("pp_docs").select("id,dati").eq("coll", coll).range(da, da + 999);
    if (error) throw new Error("Piano (" + coll + "): " + error.message);
    out.push(...((data ?? []) as Doc[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function preparaPlanning(sb: SupabaseClient, oggiS: string) {
  const OGGI = d2n(oggiS)!;
  const { data: R } = await sb.from("notifiche_regole").select("evento,attivo,ruoli,persone,email_extra").in("evento", ["planning-responsabili", "planning-ritardi", "planning-settimana"]);
  const regole = Object.fromEntries(((R ?? []) as { evento: string; attivo: boolean; ruoli: string[]; persone: string[]; email_extra: string[] }[]).map((r) => [r.evento, r]));
  const attiva = (ev: string) => !!regole[ev]?.attivo;
  if (!attiva("planning-responsabili") && !attiva("planning-ritardi") && !attiva("planning-settimana")) return { planning: 0, senzaMail: [] as string[] };

  const [commesse, macchine, persDocs, agenda, config] = await Promise.all(["commesse", "macchine", "persone", "agenda", "config"].map((c) => tutti(sb, c)));
  const chiusure = new Set<number>();
  for (const r of Object.values(((config.find((x) => x.id === "chiusure")?.dati.r) || {}) as Record<string, { s?: string; e?: string }>)) {
    const a = d2n(r.s), b = d2n(r.e || r.s); if (a != null && b != null) for (let d = a; d <= Math.min(b, a + 400); d++) chiusure.add(d);
  }
  const lavorativo = (n: number) => dow(n) < 5 && !chiusure.has(n) && !festivo(n);
  const org = ((config.find((x) => x.id === "organigramma")?.dati.r) || {}) as Record<string, string>;
  const persone: Persona[] = persDocs.map((d) => ({ ...(d.dati as Omit<Persona, "id">), id: d.id }));
  const P = new Map(persone.map((p) => [p.id, p]));

  // «chi»: le sigle e i nomi della fase, riconosciuti con le parole chiave delle persone (come nel Piano)
  const cacheChi = new Map<string, string[]>();
  const chi = (w?: string) => {
    if (!w) return [];
    if (cacheChi.has(w)) return cacheChi.get(w)!;
    const out: string[] = [];
    String(w).toUpperCase().split(/\s*(?:\+|,|\/|&|->|→)\s*/).forEach((t) => {
      const k = t.replace(/[^A-Z0-9]/g, ""); if (k.length < 2) return;
      const p = persone.find((q) => (q.k || []).some((x) => (x.length >= 4 ? k.includes(x) : k.startsWith(x)) || (k.length >= 4 && x.startsWith(k))));
      if (p && !out.includes(p.id)) out.push(p.id);
    });
    cacheChi.set(w, out); return out;
  };
  const chiIl = (p: Fase, d: number) => {
    if (p.t && p.t.length) { const out: string[] = []; p.t.forEach((r) => { const a = d2n(r.s), b = d2n(r.e); if (a != null && b != null && d >= a && d <= b) chi(r.w).forEach((x) => { if (!out.includes(x)) out.push(x); }); }); return out; }
    return chi(p.w);
  };
  const chiTutti = (p: Fase) => [...new Set([...chi(p.w), ...(p.t || []).flatMap((r) => chi(r.w))])];

  // le fasi aperte, con la loro etichetta
  type Att = { p: Fase; code: string; label: string };
  const fasi: Att[] = [];
  const perLinea = new Map<string, Doc[]>();
  macchine.forEach((m) => { const l = String(m.dati.line || ""); perLinea.set(l, [...(perLinea.get(l) || []), m]); });
  for (const c of commesse) {
    if (c.dati.chiusa) continue;
    const num = String(c.dati.num || ""), cli = String(c.dati.cliente || "");
    for (const [code, x] of Object.entries(FASI)) {
      if (x.office) continue;
      if (x.common) { const p = (c.dati.common as Record<string, Fase> | undefined)?.[code]; if (p && Object.keys(p).length) fasi.push({ p, code, label: `${num}${cli ? " " + cli : ""} · linea · ${x.n}` }); continue; }
      for (const m of perLinea.get(c.id) || []) {
        const p = (m.dati.phases as Record<string, Fase> | undefined)?.[code];
        const nome = String(m.dati.alias || m.dati.desc || m.dati.code || "macchina").slice(0, 40);
        if (p && Object.keys(p).length) fasi.push({ p, code, label: `${num} ${nome} · ${x.n}` });
      }
    }
  }
  const numDi = new Map(commesse.map((c) => [c.id, String(c.dati.num || "")]));
  const ag = new Map<string, Record<string, unknown>>();
  agenda.forEach((a) => { const d = a.dati; if (d.d && d.p) ag.set(`${d.p}|${d2n(String(d.d))}`, d); });

  // la giornata di una persona: assenza, attività del planning e fasi in corso
  const giornata = (pid: string, d: number): { assente: boolean; voci: Voce[] } => {
    const per = P.get(pid), n = ag.get(`${pid}|${d}`) as { b?: unknown; k?: string; t?: string; h1?: string; h2?: string; ore?: number; st?: string; a?: { c?: string; f?: string; h?: number }[] } | undefined;
    if (per?.att === false || (per?.fine && d2n(per.fine) != null && d > d2n(per.fine)!)) return { assente: true, voci: [] };
    if (n?.b && ASSENZE.includes(n.k || "")) return { assente: true, voci: [] };
    const voci: Voce[] = [];
    if (n?.b) voci.push({ testo: `${n.k || "Impegno"}${n.t ? ": " + n.t : ""} (giornata intera)` });
    else if (n && (n.st === "c" || n.st === "d") && (n.t || n.h1)) voci.push({ testo: `${n.h1 ? n.h1 + (n.h2 ? "–" + n.h2 : "") + " " : ""}${n.t || "Attività"}${+(n.ore || 0) > 0 ? " · " + String(n.ore).replace(".", ",") + " h" : ""}${n.st === "d" ? " (da confermare)" : ""}` });
    // ore scritte a mano su una commessa (senza fase: quelle con la fase sono già tra le fasi)
    if (n && !n.b && Array.isArray(n.a)) for (const a of n.a) if (a && a.c && !(a.f && FASI[a.f]) && +(a.h || 0) > 0)
      voci.push({ testo: `${numDi.get(a.c) || "commessa"}${n.t ? " (" + n.t + ")" : ""} · ${String(a.h).replace(".", ",")} h` });
    for (const f of fasi) {
      if (fatta(f.p)) continue;
      const s = d2n(f.p.s), e = d2n(f.p.e); if (s == null || e == null || d < s || d > e) continue;
      if (!chiIl(f.p, d).includes(pid)) continue;
      voci.push({ testo: `${f.label}${f.p.st === "d" ? " (da confermare)" : ""} · fino al ${fm(e)}`, fine: e });
    }
    return { assente: false, voci };
  };
  const ritardi = (pid: string) => fasi.filter((f) => !fatta(f.p) && d2n(f.p.e) != null && d2n(f.p.e)! < OGGI && OGGI - d2n(f.p.e)! <= RITARDO_MAX && chiTutti(f.p).includes(pid))
    .map((f) => { const e = d2n(f.p.e)!; return `${f.label} · fine prevista ${fm(e)} (${OGGI - e} ${OGGI - e === 1 ? "giorno" : "giorni"} di ritardo)`; });

  // indirizzi: Anagrafica dipendenti (persona del Piano → e-mail aziendale), poi utenti e inviti con lo stesso nome
  const [{ data: dip }, { data: prof }, { data: inv }, { data: pr }] = await Promise.all([
    sb.from("dipendenti").select("dati,attivo"),
    sb.from("profili").select("id,nome,email,attivo"),
    sb.from("inviti").select("email,nome"),
    sb.from("profilo_ruoli").select("profilo_id,ruolo_id"),
  ]);
  const mailDi = new Map<string, string>();
  ((dip ?? []) as { dati: Record<string, string>; attivo: boolean }[]).filter((x) => x.attivo !== false && x.dati.pid).forEach((x) => {
    const m = (x.dati.emailaz || x.dati.email || "").trim().toLowerCase(); if (m && !mailDi.has(x.dati.pid)) mailDi.set(x.dati.pid, m);
  });
  const perNome = new Map<string, string>();
  ((inv ?? []) as { email: string; nome: string }[]).forEach((x) => { if (x.nome && x.email) perNome.set(nomeKey(x.nome), x.email.toLowerCase()); });
  const profili = (prof ?? []) as { id: string; nome: string; email: string; attivo: boolean }[];
  profili.filter((x) => x.attivo && x.nome && x.email).forEach((x) => perNome.set(nomeKey(x.nome), x.email.toLowerCase()));
  const email = (pid: string) => mailDi.get(pid) || perNome.get(nomeKey(P.get(pid)?.name || "")) || "";
  // copia a ruoli, persone e indirizzi scelti nella pagina Notifiche
  const copia = (ev: string) => {
    const r = regole[ev]; if (!r) return [] as string[];
    const ids = new Set([...(r.persone || []), ...((pr ?? []) as { profilo_id: string; ruolo_id: string }[]).filter((x) => (r.ruoli || []).includes(x.ruolo_id)).map((x) => x.profilo_id)]);
    return [...new Set([...profili.filter((x) => x.attivo && ids.has(x.id)).map((x) => x.email.toLowerCase()), ...(r.email_extra || []).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))])];
  };

  const risorse = persone.filter((p) => p.tipo !== "risorsa" && !p.nota && !p.ext && p.att !== false && !/^da assegnare$/i.test(p.name || ""));
  const righe: { chiave: string; evento: string; oggetto: string; testo: string; link: string; destinatari: string[] }[] = [];
  const senzaMail = new Set<string>();
  const metti = (ev: string, chiave: string, pid: string, oggetto: string, testo: string) => {
    const a = email(pid); if (!a) { senzaMail.add(P.get(pid)?.name || pid); return; }
    righe.push({ chiave, evento: ev, oggetto, testo, link: "/moduli/piano-produzione", destinatari: [...new Set([a, ...copia(ev)])] });
  };
  const elenco = (L: string[]) => L.map((x) => "• " + x).join("\n");

  if (lavorativo(OGGI)) {
    // responsabili: attività di oggi dei collaboratori
    if (attiva("planning-responsabili")) {
      const resp = [...new Set(Object.values(org))].filter((r) => P.has(r));
      for (const r of resp) {
        const coll = Object.keys(org).filter((c) => org[c] === r && P.has(c)).sort((a, b) => P.get(a)!.name.localeCompare(P.get(b)!.name));
        if (!coll.length) continue;
        const parti = coll.map((c) => {
          const g = giornata(c, OGGI), rit = ritardi(c), nome = P.get(c)!.name;
          if (g.assente) return `${nome}: assente`;
          return `${nome}\n${g.voci.length ? elenco(g.voci.map((v) => v.testo)) : "• nessuna attività nel planning"}${rit.length ? `\n  In ritardo:\n${rit.map((x) => "  • " + x).join("\n")}` : ""}`;
        });
        metti("planning-responsabili", `planning-resp:${oggiS}:${r}`, r, `Attività di oggi dei tuoi collaboratori – ${giorno(OGGI)}`,
          `Ecco le attività di oggi, ${giorno(OGGI)}, dei collaboratori di cui sei responsabile nel Piano produzione.\n\n${parti.join("\n\n")}`);
      }
    }
    // ognuno: le proprie attività in ritardo
    if (attiva("planning-ritardi")) {
      for (const p of risorse) {
        const rit = ritardi(p.id); if (!rit.length) continue;
        metti("planning-ritardi", `planning-rit:${oggiS}:${p.id}`, p.id, `Attività in ritardo nel Piano produzione – ${rit.length}`,
          `Nel Piano produzione ${rit.length === 1 ? "hai un'attività con la fine prevista passata, non ancora segnata come completata" : "hai " + rit.length + " attività con la fine prevista passata, non ancora segnate come completate"}:\n\n${elenco(rit)}\n\n${rit.length === 1 ? "Se l'hai finita, segnala completata" : "Se le hai finite, segnale completate"}; altrimenti chiedi di aggiornare le date.`);
      }
    }
  }
  // lunedì: il piano della settimana
  if (dow(OGGI) === 0 && attiva("planning-settimana")) {
    const giorni = [0, 1, 2, 3, 4].map((i) => OGGI + i);
    for (const p of risorse) {
      const G = giorni.map((d) => (lavorativo(d) ? giornata(p.id, d) : null));
      const rit = ritardi(p.id);
      if (!rit.length && !G.some((g) => g && g.voci.length)) continue; // niente da dire: nessuna mail
      const parti = giorni.map((d, i) => {
        if (!lavorativo(d)) return `${giorno(d)}: giorno non lavorativo`;
        const g = G[i]!;
        return g.assente ? `${giorno(d)}: assente` : `${giorno(d)}\n${g.voci.length ? elenco(g.voci.map((v) => v.testo)) : "• nessuna attività nel planning"}`;
      });
      metti("planning-settimana", `planning-sett:${oggiS}:${p.id}`, p.id, `Il tuo piano della settimana – dal ${fm(giorni[0])} al ${fm(giorni[4])}`,
        `Buongiorno ${p.name},\necco le tue attività della settimana nel Piano produzione (weekly plan).\n\n${parti.join("\n\n")}${rit.length ? `\n\nIn ritardo:\n${elenco(rit)}` : ""}`);
    }
  }

  if (righe.length) {
    const { error } = await sb.from("notifiche").upsert(righe, { onConflict: "chiave", ignoreDuplicates: true });
    if (error) throw new Error("Coda del planning: " + error.message);
  }
  return { planning: righe.length, senzaMail: [...senzaMail].sort() };
}
