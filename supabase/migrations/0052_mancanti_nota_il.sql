-- Mancanti montaggi: data dell'ultimo aggiornamento della nota (la mette il database, non si modifica a mano)
alter table public.mancanti add column if not exists nota_il timestamptz;

create or replace function public.prepara_mancante()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('mancanti.import', true) = 'si' then return new; end if;
  new.id := old.id; new.chiave := old.chiave; new.commessa := old.commessa; new.matricola := old.matricola;
  new.macchina := old.macchina; new.op := old.op; new.op_descr := old.op_descr; new.codice := old.codice; new.descr := old.descr;
  new.qta := old.qta; new.giac_mp := old.giac_mp; new.giac_mg := old.giac_mg; new.fornitore := old.fornitore;
  new.cella := old.cella; new.cdep := old.cdep; new.ultima_lav := old.ultima_lav; new.aperto := old.aperto;
  new.op_num := old.op_num; new.giac_grezzi := old.giac_grezzi; new.ordini := old.ordini; new.consegna := old.consegna;
  new.primo_il := old.primo_il; new.visto_il := old.visto_il; new.chiuso_il := old.chiuso_il;
  new.nota_il := case when new.nota is distinct from old.nota then (case when coalesce(new.nota, '') = '' then null else now() end) else old.nota_il end;
  new.aggiornato_il := now(); new.aggiornato_da := auth.uid();
  return new;
end;
$$;
select 'ok' as nota_il;
