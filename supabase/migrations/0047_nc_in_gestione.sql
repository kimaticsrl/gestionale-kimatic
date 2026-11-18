-- =============================================================
-- Non conformità: «In gestione a» (gestione.in_carico = id utente).
-- Chi riceve la NC in gestione da un altro riceve una mail.
-- (stessa funzione della 0045, con in più la presa in carico)
-- =============================================================

create or replace function public.notifica_nc()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := new.dati; chi uuid; mail text; da text;
begin
  begin
    if tg_op = 'INSERT' then
      perform public.accoda_notifica('nc-inserita', 'nc-inserita:' || new.id,
        'Nuova non conformità ' || coalesce(new.numero, '') || ' – ' || coalesce(nullif(d ->> 'fornitore', ''), 'fornitore non indicato'),
        concat_ws(E'\n',
          'È stata inserita la non conformità ' || coalesce(new.numero, '') || '.',
          '',
          'Fornitore: ' || coalesce(nullif(d ->> 'fornitore', ''), '—'),
          case when coalesce(d ->> 'commessa', '') <> '' then 'Commessa: ' || (d ->> 'commessa') end,
          case when coalesce(d ->> 'tipo', '') <> '' then 'Tipo di difetto: ' || (d ->> 'tipo') end,
          case when coalesce(d ->> 'gravita', '') <> '' then 'Gravità: ' || (d ->> 'gravita') end,
          'Descrizione: ' || coalesce(nullif(d ->> 'descrizione', ''), '—'),
          'Segnalata da: ' || coalesce((select nome from profili where id = new.creato_da), '—')),
        '/moduli/non-conformita');
    elsif new.stato = 'chiusa' and old.stato is distinct from 'chiusa' then
      perform public.accoda_notifica('nc-chiusa', 'nc-chiusa:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MISS'),
        'Non conformità ' || coalesce(new.numero, '') || ' chiusa – ' || coalesce(nullif(d ->> 'fornitore', ''), ''),
        concat_ws(E'\n',
          'La non conformità ' || coalesce(new.numero, '') || ' è stata chiusa.',
          '',
          'Fornitore: ' || coalesce(nullif(d ->> 'fornitore', ''), '—'),
          'Descrizione: ' || coalesce(nullif(d ->> 'descrizione', ''), '—')),
        '/moduli/non-conformita');
    end if;
    -- presa in carico: mail a chi riceve la NC in gestione (non a chi se la assegna da solo)
    if tg_op = 'UPDATE' then
      chi := nullif(d #>> '{gestione,in_carico}', '')::uuid;
      if chi is not null and chi is distinct from nullif(old.dati #>> '{gestione,in_carico}', '')::uuid
         and chi is distinct from auth.uid() then
        select lower(email) into mail from profili where id = chi and attivo;
        select nome into da from profili where id = auth.uid();
        if mail is not null then
          insert into notifiche (chiave, evento, oggetto, testo, link, destinatari)
          values ('nc-assegnata:' || new.id || ':' || chi || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), 'nc-assegnata',
            'Non conformità ' || coalesce(new.numero, '') || ' in gestione a te – ' || coalesce(nullif(d ->> 'fornitore', ''), ''),
            concat_ws(E'\n',
              coalesce(da, 'Qualcuno') || ' ti ha assegnato la gestione della non conformità ' || coalesce(new.numero, '') || '.',
              '',
              'Fornitore: ' || coalesce(nullif(d ->> 'fornitore', ''), '—'),
              case when coalesce(d ->> 'commessa', '') <> '' then 'Commessa: ' || (d ->> 'commessa') end,
              case when coalesce(d ->> 'gravita', '') <> '' then 'Gravità: ' || (d ->> 'gravita') end,
              'Descrizione: ' || coalesce(nullif(d ->> 'descrizione', ''), '—'),
              case when coalesce(d #>> '{gestione,trattamento}', '') <> '' then 'Trattamento deciso: ' || (d #>> '{gestione,trattamento}') end),
            '/moduli/non-conformita', array[mail])
          on conflict (chiave) do nothing;
        end if;
      end if;
    end if;
  exception when others then null;
  end;
  return null;
end;
$$;
select 'ok' as notifiche_nc;
