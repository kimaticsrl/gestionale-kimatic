import Utenti from "@/components/Utenti";
import { soloAdmin } from "@/lib/dati";
import { annullaInvito, invita } from "../../azioni";

export default async function PaginaUtenti() {
  const { supabase, user } = await soloAdmin();
  const [{ data: ruoli }, { data: profili }, { data: assegnati }, { data: inviti }] = await Promise.all([
    supabase.from("ruoli").select("id,nome").order("ordine"),
    supabase.from("profili").select("id,email,nome,is_admin,attivo").order("nome"),
    supabase.from("profilo_ruoli").select("profilo_id,ruolo_id"),
    supabase.from("inviti").select("email,nome,ruoli,is_admin,creato_il").order("creato_il", { ascending: false }),
  ]);
  const nomeRuolo = Object.fromEntries((ruoli ?? []).map((r) => [r.id, r.nome]));
  const persone = (profili ?? []).map((p) => ({
    ...p, ruoli: (assegnati ?? []).filter((a) => a.profilo_id === p.id).map((a) => a.ruolo_id),
  }));

  return (
    <>
      <header>
        <h1>Utenti</h1>
        <p className="sub">Invita i colleghi e assegna i ruoli. Chi è invitato entra da «Primo accesso» con la sua email e sceglie una password.</p>
      </header>

      <form className="box" action={invita}>
        <h2>Invita una persona</h2>
        <p className="tag">Solo gli indirizzi invitati qui possono creare un accesso al gestionale.</p>
        <div className="row" style={{ marginBottom: 10 }}>
          <input type="text" name="nome" placeholder="Nome e cognome" aria-label="Nome e cognome" />
          <input type="email" name="email" placeholder="nome@kimatic.it" aria-label="Email" required />
          <label className="ck"><input type="checkbox" name="is_admin" /> Amministratore</label>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          {(ruoli ?? []).map((r) => <label key={r.id} className="ck"><input type="checkbox" name="ruoli" value={r.id} /> {r.nome}</label>)}
        </div>
        <button className="btn" type="submit">Invita</button>
      </form>

      {!!inviti?.length && (
        <div className="box">
          <h2>Inviti in attesa</h2>
          <p className="tag">Queste persone non hanno ancora fatto il primo accesso.</p>
          <div className="mx"><table>
            <thead><tr><th>Persona</th><th>Ruoli</th><th></th></tr></thead>
            <tbody>
              {inviti.map((i) => (
                <tr key={i.email}>
                  <td><b>{i.nome || i.email}</b><small>{i.email}</small></td>
                  <td>{[...(i.is_admin ? ["Amministratore"] : []), ...i.ruoli.map((r: string) => nomeRuolo[r] ?? r)].join(", ") || "—"}</td>
                  <td><form action={annullaInvito.bind(null, i.email)}><button className="btn link" type="submit">Annulla invito</button></form></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      <Utenti persone={persone} ruoli={ruoli ?? []} io={user.id} />
    </>
  );
}
