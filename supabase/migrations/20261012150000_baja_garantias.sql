-- Eliminar garantías con motivo y registro en el historial (project_change_log); la baja de entregables
-- también guarda el responsable. No crea tablas ni columnas: solo agrega el valor 'baja_garantia' a la
-- restricción de project_change_log.campo.
-- * eliminar_garantia(): exige motivo, registra "baja_garantia" con los datos borrados y borra.
-- * Un trigger registra cualquier borrado de una garantía hecho por otra vía y exige el motivo.
--   Guarda también cuántas renovaciones tenía (su historial se borra en cascada con la garantía).
-- security invoker: se aplican las políticas RLS del usuario (solo proyectos propios).

alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
alter table public.project_change_log
  add constraint project_change_log_campo_check check (campo in ('estado', 'fecha', 'responsable', 'alta', 'baja', 'baja_garantia'));

-- Baja de entregable: igual que antes, con el responsable al final ("frente · estado · fecha · responsable")
create or replace function public.registrar_baja_entregable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_motivo text := nullif(btrim(coalesce(current_setting('auragrid.motivo', true), '')), '');
  v_user   uuid := auth.uid();
  v_email  text := nullif(auth.jwt() ->> 'email', '');
begin
  -- Si se borra el proyecto completo (cascada) no se exige motivo ni se registra
  if not exists (select 1 from public.solar_projects where id = old.project_id) then
    return old;
  end if;
  if old.titulo in ('Garantías con la vigencia requerida', 'Garantías vigentes hasta RTB') then
    raise exception 'El entregable de garantías se calcula automáticamente y no se puede eliminar.'
      using errcode = 'P0001', hint = 'entregable_automatico';
  end if;
  if v_motivo is null then
    raise exception 'Para eliminar un entregable se requiere un motivo.' using errcode = 'P0001', hint = 'motivo_obligatorio';
  end if;
  insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
  values (old.project_id, null, old.titulo, 'baja',
          old.frente || ' · ' || old.estado || ' · ' || coalesce(old.fecha::text, '') || ' · ' || coalesce(old.responsable, ''),
          null, v_motivo, 'cambio', v_user, v_email);
  return old;
end;
$$;

revoke execute on function public.registrar_baja_entregable() from public, anon, authenticated;

-- Baja de garantía: se registra antes de borrar.
-- entregable = "tipo · beneficiario"; valor_anterior = "emisor · monto · vence · vigencia requerida · estado · renovaciones"
create or replace function public.registrar_baja_garantia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_motivo text := nullif(btrim(coalesce(current_setting('auragrid.motivo', true), '')), '');
  v_renov  integer;
begin
  if not exists (select 1 from public.solar_projects where id = old.project_id) then
    return old;
  end if;
  if v_motivo is null then
    raise exception 'Para eliminar una garantía se requiere un motivo.' using errcode = 'P0001', hint = 'motivo_obligatorio';
  end if;
  select count(*) into v_renov from public.project_guarantee_renewals where guarantee_id = old.id;
  insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
  values (old.project_id, null, left(old.tipo || ' · ' || old.beneficiario, 300), 'baja_garantia',
          old.emisor || ' · ' || old.monto::text || ' · ' || old.vence::text || ' · '
            || old.vigencia_requerida || coalesce(':' || old.vigencia_fecha::text, '') || ' · ' || old.estado || ' · ' || v_renov::text,
          null, v_motivo, 'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
  return old;
end;
$$;

revoke execute on function public.registrar_baja_garantia() from public, anon, authenticated;

drop trigger if exists project_guarantees_baja on public.project_guarantees;
create trigger project_guarantees_baja
  before delete on public.project_guarantees
  for each row execute function public.registrar_baja_garantia();

-- Baja desde la app (con motivo)
create or replace function public.eliminar_garantia(p_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform set_config('auragrid.motivo', coalesce(left(btrim(p_motivo), 500), ''), true);
  delete from public.project_guarantees where id = p_id;
  if not found then
    raise exception 'No se encontró la garantía o no tienes permiso para eliminarla.' using errcode = 'P0002', hint = 'sin_permiso';
  end if;
  -- El motivo vale solo para esta baja
  perform set_config('auragrid.motivo', '', true);
end;
$$;

revoke execute on function public.eliminar_garantia(uuid, text) from public, anon;
grant execute on function public.eliminar_garantia(uuid, text) to authenticated;

-- Reversión:
--   drop function if exists public.eliminar_garantia(uuid, text);
--   drop trigger if exists project_guarantees_baja on public.project_guarantees;
--   drop function if exists public.registrar_baja_garantia();
--   (registrar_baja_entregable: volver a la versión de 20261012140000_alta_baja_entregables.sql)
--   alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
--   alter table public.project_change_log add constraint project_change_log_campo_check check (campo in ('estado', 'fecha', 'responsable', 'alta', 'baja'));
