-- Historial de cambios de los entregables, por proyecto (project_change_log).
--
-- * Lo escribe un trigger de project_deliverables, no el navegador: cualquier cambio de estado, fecha
--   compromiso o responsable queda registrado, se haga desde la app o por otra vía.
-- * Solo lectura para los usuarios (RLS por dueño del proyecto, como las demás tablas de proyecto);
--   no hay políticas de insert/update/delete: el historial no se puede editar ni borrar desde la app.
-- * Pasar un entregable de "completo" a otro estado exige un motivo (lo valida el trigger).
-- * La app guarda los cambios con la función actualizar_entregable(), que adjunta el motivo al cambio.
-- Solo agrega objetos nuevos; no modifica columnas ni datos de las tablas existentes.

create table if not exists public.project_change_log (
  id              uuid primary key default gen_random_uuid(),
  project_id      text not null references public.solar_projects (id) on delete cascade,
  deliverable_id  uuid references public.project_deliverables (id) on delete set null,
  entregable      text not null,                 -- título al momento del cambio
  campo           text not null check (campo in ('estado', 'fecha', 'responsable')),
  valor_anterior  text,
  valor_nuevo     text,
  motivo          text,
  tipo            text not null default 'cambio' check (tipo in ('cambio', 'correccion')),
  user_id         uuid,                          -- auth.uid() de quien hizo el cambio
  user_email      text,                          -- correo de la sesión, para mostrarlo en el historial
  created_at      timestamptz not null default now()
);
create index if not exists project_change_log_proyecto_fecha_idx on public.project_change_log (project_id, created_at desc);
create index if not exists project_change_log_entregable_idx on public.project_change_log (deliverable_id, created_at desc);

alter table public.project_change_log enable row level security;

create policy "project_change_log_select_propios" on public.project_change_log
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));

revoke insert, update, delete on public.project_change_log from anon, authenticated;

-- Trigger: registra cada campo que cambió. Corre como dueño de la tabla (security definer) para poder
-- escribir en el historial aunque los usuarios no tengan permiso de insert.
create or replace function public.registrar_cambio_entregable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_motivo text := nullif(btrim(coalesce(current_setting('auragrid.motivo', true), '')), '');
  v_tipo   text := coalesce(nullif(current_setting('auragrid.tipo', true), ''), 'cambio');
  v_user   uuid := auth.uid();
  v_email  text := nullif(auth.jwt() ->> 'email', '');
begin
  if v_tipo not in ('cambio', 'correccion') then
    v_tipo := 'cambio';
  end if;
  -- Sin sesión (migraciones): el usuario se indica explícitamente; con sesión siempre manda auth.uid()
  if v_user is null then
    v_user  := nullif(current_setting('auragrid.usuario_id', true), '')::uuid;
    v_email := coalesce(v_email, nullif(current_setting('auragrid.usuario_email', true), ''));
  end if;

  if old.estado = 'completo' and new.estado <> 'completo' and v_motivo is null then
    raise exception 'Para cambiar un entregable completo a otro estado se requiere un motivo.'
      using errcode = 'P0001', hint = 'motivo_obligatorio';
  end if;

  if new.estado is distinct from old.estado then
    insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
    values (new.project_id, new.id, new.titulo, 'estado', old.estado, new.estado, v_motivo, v_tipo, v_user, v_email);
  end if;
  if new.fecha is distinct from old.fecha then
    insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
    values (new.project_id, new.id, new.titulo, 'fecha', old.fecha::text, new.fecha::text, v_motivo, v_tipo, v_user, v_email);
  end if;
  if new.responsable is distinct from old.responsable then
    insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
    values (new.project_id, new.id, new.titulo, 'responsable', old.responsable, new.responsable, v_motivo, v_tipo, v_user, v_email);
  end if;
  return new;
end;
$$;

revoke execute on function public.registrar_cambio_entregable() from public, anon, authenticated;

drop trigger if exists project_deliverables_historial on public.project_deliverables;
create trigger project_deliverables_historial
  after update on public.project_deliverables
  for each row execute function public.registrar_cambio_entregable();

-- Cambio de un entregable desde la app, con motivo opcional (obligatorio al salir de "completo").
-- security invoker: se aplican las políticas RLS del usuario (solo entregables de proyectos propios).
create or replace function public.actualizar_entregable(
  p_id uuid,
  p_estado text default null,
  p_cambiar_fecha boolean default false,
  p_fecha date default null,
  p_responsable text default null,
  p_motivo text default null
)
returns public.project_deliverables
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila public.project_deliverables;
begin
  perform set_config('auragrid.motivo', coalesce(left(btrim(p_motivo), 500), ''), true);
  perform set_config('auragrid.tipo', 'cambio', true);
  update public.project_deliverables
     set estado      = coalesce(p_estado, estado),
         fecha       = case when p_cambiar_fecha then p_fecha else fecha end,
         responsable = coalesce(left(p_responsable, 200), responsable),
         updated_at  = now()
   where id = p_id
  returning * into v_fila;
  if not found then
    raise exception 'No se encontró el entregable o no tienes permiso para modificarlo.' using errcode = 'P0002', hint = 'sin_permiso';
  end if;
  return v_fila;
end;
$$;

revoke execute on function public.actualizar_entregable(uuid, text, boolean, date, text, text) from public, anon;
grant execute on function public.actualizar_entregable(uuid, text, boolean, date, text, text) to authenticated;

-- Reversión:
--   drop function if exists public.actualizar_entregable(uuid, text, boolean, date, text, text);
--   drop trigger if exists project_deliverables_historial on public.project_deliverables;
--   drop function if exists public.registrar_cambio_entregable();
--   drop table if exists public.project_change_log;
