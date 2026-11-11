import Backup from "@/components/Backup";
import { soloAdmin } from "@/lib/dati";

export default async function PaginaBackup() {
  await soloAdmin();
  return (
    <>
      <header>
        <h1>Backup</h1>
        <p className="sub">Copie di sicurezza dei dati del gestionale.</p>
      </header>
      <Backup />
      <div className="box">
        <h2>Backup automatico ogni notte</h2>
        <p>Ogni notte alle 2 una copia completa del database viene salvata su GitHub e tenuta per 30 giorni.</p>
        <p className="tag">
          Per scaricarla: su github.com apri il repository <b>gestionale-kimatic</b> → <b>Actions</b> → <b>Backup notturno</b> →
          scegli la data → in fondo alla pagina, sezione <b>Artifacts</b>. Le foto non sono comprese: per quelle usa il pulsante qui sopra.
        </p>
      </div>
    </>
  );
}
