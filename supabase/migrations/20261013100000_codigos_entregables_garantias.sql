-- Nombres editables sin romper reglas: las reglas identifican por un código fijo, no por el nombre.
-- * project_deliverables.codigo: tipo interno fijo (no se puede cambiar). Los 20 del catálogo tienen su código;
--   los agregados por el usuario son 'otro' y no activan reglas especiales.
-- * project_guarantees.categoria: qué garantiza (interconexion · cumplimiento_epc · otra); de ella sale la
--   vigencia requerida sugerida. Antes se deducía del texto (beneficiario, concepto, tipo).
-- * El nombre de los entregables (titulo) se puede editar con actualizar_entregable(); el de las garantías es
--   su concepto, y también se editan tipo, beneficiario y categoría. Nombres no vacíos y con largo máximo.
-- * Cada cambio de nombre, tipo, beneficiario o categoría queda en project_change_log (anterior → nuevo).
-- Agrega dos columnas con valor por defecto; no borra ni renombra columnas ni tablas.

-- 1. Código fijo de los entregables ---------------------------------------------
alter table public.project_deliverables add column if not exists codigo text not null default 'otro';
alter table public.project_deliverables drop constraint if exists project_deliverables_codigo_check;
alter table public.project_deliverables add constraint project_deliverables_codigo_check check (codigo ~ '^[a-z0-9_]{1,60}$');

update public.project_deliverables d
   set codigo = c.codigo
  from (values
    ('Contrato de arrendamiento a 30 años', 'terreno_arrendamiento'),
    ('Inscripción en Registro Público', 'terreno_registro_publico'),
    ('Levantamiento topográfico y deslinde', 'terreno_topografia'),
    ('MIA modalidad regional presentada', 'ambiental_mia_presentada'),
    ('Resolutivo de MIA', 'ambiental_mia_resolutivo'),
    ('Estudio técnico justificativo (cambio de uso de suelo)', 'ambiental_cambio_uso_suelo'),
    ('EVIS presentada', 'social_evis_presentada'),
    ('Resolutivo de EVIS', 'social_evis_resolutivo'),
    ('Solicitud y estudio de impacto', 'interconexion_solicitud'),
    ('Estudio de instalaciones', 'interconexion_estudio_instalaciones'),
    ('Contrato de interconexión', 'interconexion_contrato'),
    ('Licencia de uso de suelo', 'permisos_uso_suelo'),
    ('Permiso de generación', 'permisos_generacion'),
    ('Licencia de construcción', 'permisos_licencia_construccion'),
    ('Term sheet firmado', 'financiamiento_term_sheet'),
    ('Due diligence técnica y legal', 'financiamiento_due_diligence'),
    ('Aprobación de crédito tramo 2', 'financiamiento_tramo_2'),
    ('Garantías con la vigencia requerida', 'garantias_vigencia'),
    ('Garantías vigentes hasta RTB', 'garantias_vigencia'),
    ('Cronograma EPC nivel 3', 'construccion_cronograma_epc'),
    ('Aceptación del ingeniero independiente', 'construccion_ingeniero_independiente')
  ) as c (titulo, codigo)
 where d.titulo = c.titulo and d.codigo = 'otro';

-- Un solo entregable de cada código especial por proyecto ('otro' puede repetirse)
create unique index if not exists project_deliverables_codigo_unico on public.project_deliverables (project_id, codigo) where codigo <> 'otro';

-- Nombre no vacío (se recorta) y de hasta 200 caracteres; el código no cambia nunca
create or replace function public.validar_entregable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.titulo := btrim(coalesce(new.titulo, ''));
  if new.titulo = '' then
    raise exception 'El nombre del entregable no puede quedar vacío.' using errcode = '22023', hint = 'nombre_vacio';
  end if;
  if length(new.titulo) > 200 then
    raise exception 'El nombre del entregable admite hasta 200 caracteres.' using errcode = '22023', hint = 'nombre_largo';
  end if;
  if tg_op = 'UPDATE' and new.codigo is distinct from old.codigo then
    raise exception 'El tipo interno del entregable no se puede cambiar.' using errcode = 'P0001', hint = 'codigo_fijo';
  end if;
  return new;
end;
$$;

drop trigger if exists project_deliverables_validar on public.project_deliverables;
create trigger project_deliverables_validar
  before insert or update on public.project_deliverables
  for each row execute function public.validar_entregable();

-- 2. Categoría de las garantías ----------------------------------------------------
alter table public.project_guarantees add column if not exists categoria text not null default 'otra';
alter table public.project_guarantees drop constraint if exists project_guarantees_categoria_check;
alter table public.project_guarantees add constraint project_guarantees_categoria_check
  check (categoria in ('interconexion', 'cumplimiento_epc', 'otra'));

-- Misma deducción que usaba la app (categoriaGarantia): CENACE o interconexión → interconexion; EPC o cumplimiento → cumplimiento_epc
update public.project_guarantees
   set categoria = case
     when lower(translate(beneficiario || ' ' || concepto || ' ' || tipo, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) ~ '(cenace|interconexion)' then 'interconexion'
     when lower(translate(beneficiario || ' ' || concepto || ' ' || tipo, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) ~ '(\mepc\M|cumplimiento)' then 'cumplimiento_epc'
     else 'otra' end;

-- Nombre (concepto), tipo y beneficiario no vacíos (se recortan) y con largo máximo
create or replace function public.validar_garantia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.concepto := btrim(coalesce(new.concepto, ''));
  new.tipo := btrim(coalesce(new.tipo, ''));
  new.beneficiario := btrim(coalesce(new.beneficiario, ''));
  if new.concepto = '' or new.tipo = '' or new.beneficiario = '' then
    raise exception 'El nombre, el tipo y el beneficiario de la garantía no pueden quedar vacíos.' using errcode = '22023', hint = 'nombre_vacio';
  end if;
  if length(new.concepto) > 200 or length(new.tipo) > 60 or length(new.beneficiario) > 120 then
    raise exception 'Máximos: nombre 200, tipo 60 y beneficiario 120 caracteres.' using errcode = '22023', hint = 'nombre_largo';
  end if;
  return new;
end;
$$;

drop trigger if exists project_guarantees_validar on public.project_guarantees;
create trigger project_guarantees_validar
  before insert or update on public.project_guarantees
  for each row execute function public.validar_garantia();

-- 3. Historial ------------------------------------------------------------------------
alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
alter table public.project_change_log
  add constraint project_change_log_campo_check check (campo in (
    'estado', 'fecha', 'responsable', 'titulo', 'alta', 'baja',
    'baja_garantia', 'garantia_concepto', 'garantia_tipo', 'garantia_beneficiario', 'garantia_categoria'));

-- Entregables: igual que antes, más el cambio de nombre
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

  if new.titulo is distinct from old.titulo then
    insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
    values (new.project_id, new.id, new.titulo, 'titulo', old.titulo, new.titulo, v_motivo, v_tipo, v_user, v_email);
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

-- Garantías: cambios de nombre (concepto), tipo, beneficiario y categoría. entregable = "Garantía: tipo · beneficiario" (nuevos)
create or replace function public.registrar_cambio_garantia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etiqueta text := left('Garantía: ' || new.tipo || ' · ' || new.beneficiario, 300);
  v_user     uuid := auth.uid();
  v_email    text := nullif(auth.jwt() ->> 'email', '');
begin
  if new.concepto is distinct from old.concepto then
    insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
    values (new.project_id, v_etiqueta, 'garantia_concepto', old.concepto, new.concepto, 'cambio', v_user, v_email);
  end if;
  if new.tipo is distinct from old.tipo then
    insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
    values (new.project_id, v_etiqueta, 'garantia_tipo', old.tipo, new.tipo, 'cambio', v_user, v_email);
  end if;
  if new.beneficiario is distinct from old.beneficiario then
    insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
    values (new.project_id, v_etiqueta, 'garantia_beneficiario', old.beneficiario, new.beneficiario, 'cambio', v_user, v_email);
  end if;
  if new.categoria is distinct from old.categoria then
    insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
    values (new.project_id, v_etiqueta, 'garantia_categoria', old.categoria, new.categoria, 'cambio', v_user, v_email);
  end if;
  return new;
end;
$$;

revoke execute on function public.registrar_cambio_garantia() from public, anon, authenticated;

drop trigger if exists project_guarantees_historial on public.project_guarantees;
create trigger project_guarantees_historial
  after update on public.project_guarantees
  for each row execute function public.registrar_cambio_garantia();

-- 4. actualizar_entregable() acepta el nombre ----------------------------------------
drop function if exists public.actualizar_entregable(uuid, text, boolean, date, text, text);
create or replace function public.actualizar_entregable(
  p_id uuid,
  p_estado text default null,
  p_cambiar_fecha boolean default false,
  p_fecha date default null,
  p_responsable text default null,
  p_motivo text default null,
  p_titulo text default null
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
         titulo      = coalesce(p_titulo, titulo),
         updated_at  = now()
   where id = p_id
  returning * into v_fila;
  if not found then
    raise exception 'No se encontró el entregable o no tienes permiso para modificarlo.' using errcode = 'P0002', hint = 'sin_permiso';
  end if;
  perform set_config('auragrid.motivo', '', true);
  return v_fila;
exception
  when unique_violation then
    raise exception 'Ya existe un entregable con ese nombre en el proyecto.' using errcode = '23505', hint = 'duplicado';
end;
$$;

revoke execute on function public.actualizar_entregable(uuid, text, boolean, date, text, text, text) from public, anon;
grant execute on function public.actualizar_entregable(uuid, text, boolean, date, text, text, text) to authenticated;

-- 5. El entregable automático de garantías se protege por código, no por nombre -------
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
  if old.codigo = 'garantias_vigencia' then
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

-- Reversión:
--   drop trigger if exists project_guarantees_historial on public.project_guarantees; drop function if exists public.registrar_cambio_garantia();
--   drop trigger if exists project_guarantees_validar on public.project_guarantees; drop function if exists public.validar_garantia();
--   drop trigger if exists project_deliverables_validar on public.project_deliverables; drop function if exists public.validar_entregable();
--   drop function if exists public.actualizar_entregable(uuid, text, boolean, date, text, text, text);
--   (actualizar_entregable, registrar_cambio_entregable y registrar_baja_entregable: volver a las versiones de
--    20261012100000 y 20261012150000)
--   drop index if exists public.project_deliverables_codigo_unico;
--   alter table public.project_deliverables drop column if exists codigo;
--   alter table public.project_guarantees drop column if exists categoria;
--   restricción de project_change_log.campo: volver a la de 20261012150000
