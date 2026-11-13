import Nav from "@/components/Nav";
import { utenteCorrente, diDirezione } from "@/lib/dati";
import { esci } from "./azioni";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profilo } = await utenteCorrente();
  const [{ data: reparti }, { data: moduli }] = await Promise.all([
    supabase.from("reparti").select("id,nome").order("ordine"),
    supabase.rpc("miei_moduli"),
  ]);
  const mods = (moduli ?? []) as { reparto_id: string }[];
  const admin = !!profilo?.is_admin && profilo.attivo;
  const direzione = await diDirezione(supabase);

  const voci = [
    { href: "/", label: "Tutti i moduli", n: mods.length },
    ...(reparti ?? [])
      .filter((r) => mods.some((m) => m.reparto_id === r.id))
      .map((r) => ({ href: `/reparto/${r.id}`, label: r.nome, colore: `var(--${r.id})`, n: mods.filter((m) => m.reparto_id === r.id).length })),
    ...(admin ? ["sep" as const, { href: "/admin/utenti", label: "Utenti" }, { href: "/admin/permessi", label: "Permessi" }, { href: "/admin/registro", label: "Registro modifiche" }] : []),
    ...(direzione ? [...(admin ? [] : ["sep" as const]), { href: "/admin/backup", label: "Backup" }] : []),
  ];

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="logo"><img src="/logo-kimatic.png" alt="Kimatic" width={356} height={252} /></span>
          <span className="tag">Gestionale aziendale</span>
        </div>
        <Nav voci={voci} />
        <div className="me">
          <span><b>{profilo?.nome || user.email}</b>{admin ? " · amministratore" : ""}</span>
          <form action={esci}><button className="btn link" type="submit">Esci</button></form>
        </div>
      </aside>
      <main>
        {!profilo?.attivo
          ? <div className="empty">Il tuo accesso è disattivato. Rivolgiti a un amministratore.</div>
          : children}
      </main>
    </div>
  );
}
