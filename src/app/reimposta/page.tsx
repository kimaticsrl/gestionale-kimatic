"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/* Nuova password: dal link della mail «Password dimenticata?» oppure, già collegati, per cambiarla.
   Il link può arrivare come ?token_hash=…&type=recovery (modello mail consigliato, funziona anche
   aprendolo da un altro dispositivo) o come ?code=… (modello standard di Supabase). */
export default function Reimposta() {
  const router = useRouter();
  const [stato, setStato] = useState<"verifica" | "pronto" | "errore" | "fatto">("verifica");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [errore, setErrore] = useState("");
  const [attesa, setAttesa] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const q = new URLSearchParams(location.search);
      const th = q.get("token_hash"), code = q.get("code");
      let err: { message: string } | null = null;
      if (th) ({ error: err } = await sb.auth.verifyOtp({ token_hash: th, type: "recovery" }));
      else if (code) ({ error: err } = await sb.auth.exchangeCodeForSession(code));
      if (q.get("error_description")) err = { message: q.get("error_description")! };
      const { data } = await sb.auth.getUser();
      if (data.user) { setEmail(data.user.email ?? ""); setStato("pronto"); history.replaceState(null, "", "/reimposta"); return; }
      setErrore(err && /expired|invalid/i.test(err.message)
        ? "Il link è scaduto o è già stato usato. Chiedine uno nuovo dalla pagina di accesso."
        : "Link non valido. Chiedine uno nuovo dalla pagina di accesso con «Password dimenticata?».");
      setStato("errore");
    })();
  }, []);

  async function salva(e: React.FormEvent) {
    e.preventDefault(); setErrore("");
    if (pw.length < 8) { setErrore("La password deve avere almeno 8 caratteri."); return; }
    if (pw !== pw2) { setErrore("Le due password non coincidono."); return; }
    setAttesa(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setAttesa(false);
    if (error) {
      setErrore(/different from the old/i.test(error.message) ? "La nuova password deve essere diversa da quella vecchia."
        : /weak|should be/i.test(error.message) ? "Password troppo debole: usane una più lunga." : error.message);
      return;
    }
    setStato("fatto");
    setTimeout(() => { router.replace("/"); router.refresh(); }, 1500);
  }

  return (
    <div className="login">
      <form className="box" onSubmit={salva}>
        <div className="brand">
          <span className="logo"><img src="/logo/kimatic" alt="Kimatic" width={356} height={252} /></span>
          <span className="tag">Gestionale aziendale</span>
        </div>
        <h1 style={{ fontSize: 20, margin: 0 }}>Nuova password</h1>
        {stato === "verifica" && <p className="sub">Controllo il link…</p>}
        {stato === "errore" && <>
          <div className="msg err" role="alert">{errore}</div>
          <a className="btn" href="/login">Vai all&apos;accesso</a>
        </>}
        {stato === "pronto" && <>
          {email && <p className="sub" style={{ margin: 0, fontSize: 13.5 }}>Account: <b>{email}</b></p>}
          <label>Nuova password (almeno 8 caratteri)
            <input type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <label>Ripeti la nuova password
            <input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
          {errore && <div className="msg err" role="alert">{errore}</div>}
          <button className="btn" disabled={attesa} type="submit">{attesa ? "Attendi…" : "Salva la nuova password"}</button>
        </>}
        {stato === "fatto" && <div className="msg" role="status">Password cambiata. Ti porto al gestionale…</div>}
      </form>
    </div>
  );
}
