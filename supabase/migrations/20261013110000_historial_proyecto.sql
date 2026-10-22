-- Editar un proyecto (nombre, capacidad, estado, CAPEX) con validación, y registro en el historial de todos los
-- cambios del proyecto y de sus supuestos financieros (antes solo se registraban entregables y garantías).
-- * validar_proyecto: nombre y estado no vacíos y con largo máximo; capacidad entre 0 y 2,000 MWac; CAPEX con cifra.
-- * registrar_cambio_proyecto: nombre, capacidad, estado, CAPEX, RTB objetivo, margen de garantías y archivado.
-- * registrar_cambio_supuestos: cada columna de project_financial_assumptions que cambie ("columna=valor").
-- No crea tablas ni columnas: solo agrega valores a la restricción de project_change_log.campo.

alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
alter table public.project_change_log
  add constraint project_change_log_campo_check check (campo in (
    'estado', 'fecha', 'responsable', 'titulo', 'alta', 'baja',
    'baja_garantia', 'garantia_concepto', 'garantia_tipo', 'garantia_beneficiario', 'garantia_categoria',
    'proyecto_nombre', 'proyecto_capacidad', 'proyecto_estado', 'proyecto_capex', 'proyecto_rtb', 'proyecto_margen',
    'proyecto_archivo', 'supuesto'));

-- 1. Validación del proyecto ------------------------------------------------------------
create or replace function public.validar_proyecto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.name := btrim(coalesce(new.name, ''));
  new.state := btrim(coalesce(new.state, ''));
  if new.name = '' or length(new.name) > 120 then
    raise exception 'El nombre del proyecto es obligatorio y admite hasta 120 caracteres.' using errcode = '22023', hint = 'nombre_invalido';
  end if;
  if new.state = '' or length(new.state) > 60 then
    raise exception 'El estado del proyecto es obligatorio.' using errcode = '22023', hint = 'estado_invalido';
  end if;
  if new.capacity_mw is null or new.capacity_mw <= 0 or new.capacity_mw > 2000 then
    raise exception 'La capacidad debe estar entre 0 y 2,000 MWac.' using errcode = '22023', hint = 'capacidad_invalida';
  end if;
  if coalesce(new.capex, '') !~ '[0-9]' then
    raise exception 'El CAPEX debe ser una cifra en USD.' using errcode = '22023', hint = 'capex_invalido';
  end if;
  return new;
end;
$$;

drop trigger if exists solar_projects_validar on public.solar_projects;
create trigger solar_projects_validar
  before insert or update on public.solar_projects
  for each row execute function public.validar_proyecto();

-- 2. Historial de cambios del proyecto ----------------------------------------------------
create or replace function public.registrar_cambio_proyecto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_email text := nullif(auth.jwt() ->> 'email', '');
  procedure_campos text[][] := array[
    ['proyecto_nombre', old.name, new.name],
    ['proyecto_capacidad', old.capacity_mw::text, new.capacity_mw::text],
    ['proyecto_estado', old.state, new.state],
    ['proyecto_capex', old.capex, new.capex],
    ['proyecto_rtb', old.fecha_rtb::text, new.fecha_rtb::text],
    ['proyecto_margen', old.margen_garantias_dias::text, new.margen_garantias_dias::text],
    ['proyecto_archivo', case when coalesce(old.is_archived, false) then 'archivado' else 'activo' end,
                         case when coalesce(new.is_archived, false) then 'archivado' else 'activo' end]
  ];
  i int;
begin
  for i in 1 .. array_length(procedure_campos, 1) loop
    if procedure_campos[i][2] is distinct from procedure_campos[i][3] then
      insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
      values (new.id, 'Proyecto', procedure_campos[i][1], procedure_campos[i][2], procedure_campos[i][3], 'cambio', v_user, v_email);
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.registrar_cambio_proyecto() from public, anon, authenticated;

drop trigger if exists solar_projects_historial on public.solar_projects;
create trigger solar_projects_historial
  after update on public.solar_projects
  for each row execute function public.registrar_cambio_proyecto();

-- 3. Historial de cambios de los supuestos financieros -----------------------------------
create or replace function public.registrar_cambio_supuestos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes  jsonb := to_jsonb(old);
  v_despues jsonb := to_jsonb(new);
  v_clave  text;
begin
  for v_clave in select jsonb_object_keys(v_despues) loop
    if v_clave in ('id', 'project_id', 'created_at', 'updated_at') then
      continue;
    end if;
    if (v_antes -> v_clave) is distinct from (v_despues -> v_clave) then
      insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
      values (new.project_id, 'Supuestos financieros', 'supuesto',
              v_clave || '=' || coalesce(v_antes ->> v_clave, ''), v_clave || '=' || coalesce(v_despues ->> v_clave, ''),
              'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.registrar_cambio_supuestos() from public, anon, authenticated;

drop trigger if exists project_financial_assumptions_historial on public.project_financial_assumptions;
create trigger project_financial_assumptions_historial
  after update on public.project_financial_assumptions
  for each row execute function public.registrar_cambio_supuestos();

-- Reversión:
--   drop trigger if exists project_financial_assumptions_historial on public.project_financial_assumptions; drop function if exists public.registrar_cambio_supuestos();
--   drop trigger if exists solar_projects_historial on public.solar_projects; drop function if exists public.registrar_cambio_proyecto();
--   drop trigger if exists solar_projects_validar on public.solar_projects; drop function if exists public.validar_proyecto();
--   restricción de project_change_log.campo: volver a la de 20261013100000
