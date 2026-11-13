export function creaClaude(ctx: {
  supabase: unknown;
  utente: { id: string; nome: string; email: string };
  livello: string;
  tabella?: string;
  raccolta?: (percorso: string) => string;
  capacita?: string[];
  rpcAggiorna?: string | null;
  tempoReale?: boolean;
}): unknown;
