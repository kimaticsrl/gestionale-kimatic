export type Livello = "nessuno" | "legge" | "modifica" | "gestisce";
export const LIVELLI: Livello[] = ["gestisce", "modifica", "legge", "nessuno"];
export const NOME_LIVELLO: Record<Livello, string> = {
  gestisce: "Gestisce", modifica: "Modifica", legge: "Legge", nessuno: "—",
};
