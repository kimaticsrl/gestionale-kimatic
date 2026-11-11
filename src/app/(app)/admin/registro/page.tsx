import Registro from "@/components/Registro";
import { soloAdmin } from "@/lib/dati";

export default async function PaginaRegistro() {
  await soloAdmin();
  return (
    <>
      <header>
        <h1>Registro modifiche</h1>
        <p className="sub">Chi ha creato, modificato o eliminato cosa, e quando. I salvataggi automatici della stessa persona sullo stesso documento entro 15 minuti sono raggruppati in una sola voce.</p>
      </header>
      <Registro />
    </>
  );
}
