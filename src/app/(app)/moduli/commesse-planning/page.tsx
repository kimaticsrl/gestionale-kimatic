import { redirect } from "next/navigation";

// «Commesse e planning» è stato tolto (migrazione 0063): le stesse schede sono nel Piano produzione.
export default function PaginaCommessePlanning() {
  redirect("/moduli/piano-produzione");
}
