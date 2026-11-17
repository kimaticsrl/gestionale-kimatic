"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

function traduci(msg: string) {
  if (/Database error|non invitato/i.test(msg)) return "Questo indirizzo non è stato invitato. Chiedi a un amministratore di aggiungerti.";
  if (/Invalid login credentials/i.test(msg)) return "Email o password non corrette.";
  if (/already registered/i.test(msg)) return "Hai già un account: usa «Accedi».";
  if (/Password should be/i.test(msg)) return "La password deve avere almeno 8 caratteri.";
  if (/Email not confirmed/i.test(msg)) return "Devi prima confermare l'indirizzo email.";
  return msg;
}

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState<"accedi" | "primo" | "recupero">("accedi");
  const [ok, setOk] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState("");
  const [attesa, setAttesa] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(""); setOk("");
    if (modo === "recupero") {
      setAttesa(true);
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + "/reimposta" });
      setAttesa(false);
      if (error && /rate limit|too many/i.test(error.message)) { setErrore("Troppe richieste: riprova tra qualche minuto."); return; }
      // stessa risposta che l'indirizzo esista o no
      setOk("Se l'indirizzo ha un accesso al gestionale, tra poco riceverai una mail con il link per scegliere una nuova password. Controlla anche lo spam.");
      return;
    }
    if (modo === "primo" && password.length < 8) { setErrore("La password deve avere almeno 8 caratteri."); return; }
    setAttesa(true);
    const supabase = supabaseBrowser();
    const indirizzo = email.trim().toLowerCase();
    const { data, error } = modo === "accedi"
      ? await supabase.auth.signInWithPassword({ email: indirizzo, password })
      : await supabase.auth.signUp({ email: indirizzo, password });
    setAttesa(false);
    if (error) { setErrore(traduci(error.message)); return; }
    if (!data.session) { setErrore("Account creato: controlla la posta per confermare l'indirizzo, poi accedi."); return; }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="login">
      <form className="box" onSubmit={invia}>
        <div className="brand">
          <span className="logo"><img src="/logo/kimatic" alt="Kimatic" width={356} height={252} /></span>
          <span className="tag">Gestionale aziendale</span>
        </div>
        <div className="tabs" role="group" aria-label="Tipo di accesso">
          <button type="button" aria-pressed={modo === "accedi"} onClick={() => setModo("accedi")}>Accedi</button>
          <button type="button" aria-pressed={modo === "primo"} onClick={() => setModo("primo")}>Primo accesso</button>
        </div>
        {modo === "primo" && <p className="sub" style={{ margin: 0, fontSize: 13.5 }}>Usa l&apos;email con cui sei stato invitato e scegli una password.</p>}
        <label>Email aziendale
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {modo === "recupero"
          ? <p className="sub" style={{ margin: 0, fontSize: 13.5 }}>Scrivi l&apos;email con cui accedi: ti mandiamo un link per scegliere una nuova password.</p>
          : <label>{modo === "primo" ? "Scegli una password (almeno 8 caratteri)" : "Password"}
              <input type="password" required autoComplete={modo === "primo" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>}
        {errore && <div className="msg err" role="alert">{errore}</div>}
        {ok && <div className="msg ok" role="status">{ok}</div>}
        <button className="btn" disabled={attesa} type="submit">{attesa ? "Attendi…" : modo === "accedi" ? "Accedi" : modo === "primo" ? "Crea il mio accesso" : "Invia il link"}</button>
        {modo === "accedi" && <button type="button" className="btn link" onClick={() => { setModo("recupero"); setErrore(""); setOk(""); }}>Password dimenticata?</button>}
        {modo === "recupero" && <button type="button" className="btn link" onClick={() => { setModo("accedi"); setErrore(""); setOk(""); }}>← Torna all&apos;accesso</button>}
      </form>
    </div>
  );
}
