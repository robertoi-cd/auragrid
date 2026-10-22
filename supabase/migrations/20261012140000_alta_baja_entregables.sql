-- Agregar y eliminar entregables desde la app, con registro en el historial (project_change_log).
-- * agregar_entregable(): crea el entregable (pendiente) al final de su frente, o en un frente nuevo, y registra
--   "alta". Las altas masivas al crear un proyecto no pasan por aquí y no llenan el historial.
-- * eliminar_entregable(): exige motivo, registra "baja" y borra. El entregable automático de garantías no se borra.
-- * Un trigger también registra cualquier borrado hecho por otra vía y exige el motivo.
-- security invoker: se aplican las políticas RLS del usuario (solo proyectos propios).

alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
alter table public.project_change_log
  add constraint project_change_log_campo_check check (campo in ('estado', 'fecha', 'responsable', 'alta', 'baja'));

-- Baja: se registra antes de borrar; el deliverable_id queda en null por la FK (on delete set null)
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
  values (old.project_id, null, old.titulo, 'baja', old.frente || ' · ' || old.estado || coalesce(' · ' || old.fecha::text, ''), null, v_motivo, 'cambio', v_user, v_email);
  return old;
end;
$$;

revoke execute on function public.registrar_baja_entregable() from public, anon, authenticated;

drop trigger if exists project_deliverables_baja on public.project_deliverables;
create trigger project_deliverables_baja
  before delete on public.project_deliverables
  for each row execute function public.registrar_baja_entregable();

-- Alta desde la app
create or replace function public.agregar_entregable(
  p_project_id text,
  p_frente text,
  p_titulo text,
  p_responsable text default '',
  p_fecha date default null,
  p_motivo text default null
)
returns public.project_deliverables
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_frente text := left(btrim(p_frente), 100);
  v_titulo text := left(btrim(p_titulo), 200);
  v_frente_orden integer;
  v_orden integer;
  v_fila public.project_deliverables;
begin
  if coalesce(v_frente, '') = '' or coalesce(v_titulo, '') = '' then
    raise exception 'Indica el frente y el nombre del entregable.' using errcode = '22023';
  end if;
  -- Orden: al final del frente; un frente nuevo va al final de los frentes
  select min(frente_orden), coalesce(max(orden), -1) + 1 into v_frente_orden, v_orden
    from public.project_deliverables where project_id = p_project_id and frente = v_frente;
  if v_frente_orden is null then
    select coalesce(max(frente_orden), -1) + 1 into v_frente_orden from public.project_deliverables where project_id = p_project_id;
    v_orden := 0;
  end if;

  -- El trigger de alta registra este insert en el historial (solo los hechos con esta función)
  perform set_config('auragrid.registrar_alta', 'si', true);
  perform set_config('auragrid.motivo', coalesce(left(btrim(p_motivo), 500), ''), true);
  insert into public.project_deliverables (project_id, frente, frente_orden, orden, titulo, estado, responsable, fecha)
  values (p_project_id, v_frente, v_frente_orden, v_orden, v_titulo, 'pendiente', left(coalesce(p_responsable, ''), 200), p_fecha)
  returning * into v_fila;
  perform set_config('auragrid.registrar_alta', '', true);
  perform set_config('auragrid.motivo', '', true);
  return v_fila;
exception
  when unique_violation then
    raise exception 'Ya existe un entregable con ese nombre en el proyecto.' using errcode = '23505', hint = 'duplicado';
end;
$$;

-- Alta: el historial no admite insert directo de los usuarios; lo escribe este trigger (dueño de la tabla) y solo
-- para las altas hechas con agregar_entregable() (las 20 iniciales de un proyecto nuevo no se registran)
create or replace function public.registrar_alta_entregable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('auragrid.registrar_alta', true), '') = 'si' then
    insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
    values (new.project_id, new.id, new.titulo, 'alta', null, new.frente,
            nullif(btrim(coalesce(current_setting('auragrid.motivo', true), '')), ''), 'cambio',
            auth.uid(), nullif(auth.jwt() ->> 'email', ''));
  end if;
  return new;
end;
$$;

revoke execute on function public.registrar_alta_entregable() from public, anon, authenticated;

drop trigger if exists project_deliverables_alta on public.project_deliverables;
create trigger project_deliverables_alta
  after insert on public.project_deliverables
  for each row execute function public.registrar_alta_entregable();

-- Baja desde la app (con motivo)
create or replace function public.eliminar_entregable(p_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform set_config('auragrid.motivo', coalesce(left(btrim(p_motivo), 500), ''), true);
  delete from public.project_deliverables where id = p_id;
  if not found then
    raise exception 'No se encontró el entregable o no tienes permiso para eliminarlo.' using errcode = 'P0002', hint = 'sin_permiso';
  end if;
  -- El motivo vale solo para esta baja
  perform set_config('auragrid.motivo', '', true);
end;
$$;

revoke execute on function public.agregar_entregable(text, text, text, text, date, text) from public, anon;
grant execute on function public.agregar_entregable(text, text, text, text, date, text) to authenticated;
revoke execute on function public.eliminar_entregable(uuid, text) from public, anon;
grant execute on function public.eliminar_entregable(uuid, text) to authenticated;

-- Reversión:
--   drop function if exists public.eliminar_entregable(uuid, text);
--   drop function if exists public.agregar_entregable(text, text, text, text, date, text);
--   drop trigger if exists project_deliverables_alta on public.project_deliverables;
--   drop function if exists public.registrar_alta_entregable();
--   drop trigger if exists project_deliverables_baja on public.project_deliverables;
--   drop function if exists public.registrar_baja_entregable();
--   alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
--   alter table public.project_change_log add constraint project_change_log_campo_check check (campo in ('estado', 'fecha', 'responsable'));
