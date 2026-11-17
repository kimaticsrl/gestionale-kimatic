import Notifiche from "@/components/Notifiche";
import { soloAdmin } from "@/lib/dati";
import { configurate } from "@/lib/notifiche";

export const dynamic = "force-dynamic";

export default async function PaginaNotifiche() {
  const { supabase } = await soloAdmin();
  const [{ data: regole, error }, { data: ruoli }, { data: persone }, { data: storico }] = await Promise.all([
    supabase.from("notifiche_regole").select("*").order("ordine"),
    supabase.from("ruoli").select("id,nome").order("ordine"),
    supabase.from("profili").select("id,nome,email").eq("attivo", true).order("nome"),
    supabase.from("notifiche").select("id,evento,oggetto,destinatari,creata_il,inviata_il,tentativi,errore").order("creata_il", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <header>
        <h1>Notifiche</h1>
        <p className="sub">Mail automatiche spedite dalla Gmail del gestionale. Per ogni evento scegli chi le riceve: le modifiche si salvano subito.</p>
      </header>
      {error
        ? <div className="msg err">Manca la migrazione 0045 (notifiche): lanciala nell&apos;SQL Editor di Supabase.</div>
        : <Notifiche regole={regole ?? []} ruoli={ruoli ?? []} persone={persone ?? []} storico={storico ?? []} manca={configurate()} />}
    </>
  );
}
