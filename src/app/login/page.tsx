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
  const [modo, setModo] = useState<"accedi" | "primo">("accedi");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState("");
  const [attesa, setAttesa] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore("");
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
          <span className="logo"><img src="/logo-kimatic.png" alt="Kimatic" width={356} height={252} /></span>
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
        <label>{modo === "primo" ? "Scegli una password (almeno 8 caratteri)" : "Password"}
          <input type="password" required autoComplete={modo === "primo" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {errore && <div className="msg err" role="alert">{errore}</div>}
        <button className="btn" disabled={attesa} type="submit">{attesa ? "Attendi…" : modo === "accedi" ? "Accedi" : "Crea il mio accesso"}</button>
      </form>
    </div>
  );
}
