import Loghi from "@/components/Loghi";
import { soloAdmin } from "@/lib/dati";

export default async function PaginaLoghi() {
  await soloAdmin();
  return (
    <>
      <header>
        <h1>Loghi</h1>
        <p className="sub">I loghi usati nel gestionale e nei PDF. Un logo nuovo vale subito ovunque, entro un minuto.</p>
      </header>
      <Loghi />
    </>
  );
}
