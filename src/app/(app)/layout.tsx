import Nav from "@/components/Nav";
import VediCome from "@/components/VediCome";
import { utenteCorrente, diDirezione } from "@/lib/dati";
import { esci } from "./azioni";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profilo, simulato } = await utenteCorrente();
  const adminVero = !!profilo?.is_admin && !!profilo.attivo;
  const [{ data: reparti }, { data: moduli }, { data: ruoli }] = await Promise.all([
    supabase.from("reparti").select("id,nome").order("ordine"),
    supabase.rpc("miei_moduli"),
    adminVero ? supabase.from("ruoli").select("id,nome").order("ordine") : Promise.resolve({ data: [] }),
  ]);
  const mods = (moduli ?? []) as { reparto_id: string }[];
  const admin = adminVero && !simulato;
  const direzione = await diDirezione(supabase);

  const voci = [
    { href: "/", label: "Tutti i moduli", n: mods.length },
    ...(reparti ?? [])
      .filter((r) => mods.some((m) => m.reparto_id === r.id))
      .map((r) => ({ href: `/reparto/${r.id}`, label: r.nome, colore: `var(--${r.id})`, n: mods.filter((m) => m.reparto_id === r.id).length })),
    ...(admin ? ["sep" as const, { href: "/admin/utenti", label: "Utenti" }, { href: "/admin/permessi", label: "Permessi" }, { href: "/admin/registro", label: "Registro modifiche" }, { href: "/admin/loghi", label: "Loghi" }, { href: "/admin/notifiche", label: "Notifiche" }] : []),
    ...(direzione ? [...(admin ? [] : ["sep" as const]), { href: "/admin/backup", label: "Backup" }] : []),
  ];

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="logo"><img src="/logo/kimatic" alt="Kimatic" width={356} height={252} /></span>
          <span className="tag">Gestionale aziendale</span>
        </div>
        <Nav voci={voci} />
        <div className="me">
          <span><b>{profilo?.nome || user.email}</b>{admin ? " · amministratore" : ""}</span>
          <a className="btn link" href="/reimposta">Cambia password</a>
          <form action={esci}><button className="btn link" type="submit">Esci</button></form>
        </div>
      </aside>
      <main>
        {adminVero && <VediCome ruoli={(ruoli ?? []) as { id: string; nome: string }[]} attuale={simulato} />}
        {!profilo?.attivo
          ? <div className="empty">Il tuo accesso è disattivato. Rivolgiti a un amministratore.</div>
          : children}
      </main>
    </div>
  );
}
