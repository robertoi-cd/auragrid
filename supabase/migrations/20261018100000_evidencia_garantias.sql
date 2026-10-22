-- Documentos de las garantías (póliza de fianza, carta de crédito, endoso): mismas reglas de archivos y permisos que
-- los documentos de los entregables.
-- * Tabla nueva guarantee_evidence (no modifica tablas existentes). Ruta en el bucket privado "aura-documentos":
--   <project_id>/garantias/<guarantee_id>/<archivo>.
-- * Lector: ve y descarga. Editor y dueño: suben y eliminan (con motivo). Un archivo subido no se modifica.
-- * Una garantía con documentos no se puede eliminar hasta borrarlos (cada uno con su motivo). Borrar el proyecto
--   completo sí los borra (cascada).
-- * Historial: alta y baja de cada documento (campos garantia_doc_alta / garantia_doc_baja).
-- * La app considera vigente un documento si se subió después de la última renovación registrada de la garantía.

-- 1. Tabla -------------------------------------------------------------------------------
create table if not exists public.guarantee_evidence (
  id               uuid primary key default gen_random_uuid(),
  project_id       text not null references public.solar_projects (id) on delete cascade,
  -- no action (se revisa al final de la sentencia): impide borrar solo la garantía, pero no el proyecto en cascada
  guarantee_id     uuid not null references public.project_guarantees (id) on delete no action,
  ruta             text not null unique,
  nombre           text not null check (length(btrim(nombre)) between 1 and 200),
  tamano           bigint not null check (tamano > 0 and tamano <= 52428800),
  tipo_mime        text not null check (tipo_mime = any (array[
                     'application/pdf',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'application/xml', 'text/xml',
                     'application/vnd.ms-project', 'application/x-primavera-xer',
                     'image/jpeg', 'image/png'])),
  nota             text check (length(nota) <= 500),
  subido_por       uuid not null default auth.uid(),
  subido_por_email text default nullif(auth.jwt() ->> 'email', ''),
  subido_en        timestamptz not null default now(),
  -- Ruta <project_id>/garantias/<guarantee_id>/<archivo>, sin subcarpetas
  check (ruta like project_id || '/garantias/' || guarantee_id::text || '/%'
         and ruta not like project_id || '/garantias/' || guarantee_id::text || '/%/%')
);
create index if not exists guarantee_evidence_garantia_idx on public.guarantee_evidence (guarantee_id);
create index if not exists guarantee_evidence_proyecto_idx on public.guarantee_evidence (project_id);
alter table public.guarantee_evidence enable row level security;

create policy "guarantee_evidence_select" on public.guarantee_evidence for select to authenticated using (public.puede_ver(project_id));
create policy "guarantee_evidence_insert" on public.guarantee_evidence for insert to authenticated
  with check (public.puede_editar(project_id) and subido_por = (select auth.uid())
    and exists (select 1 from public.project_guarantees g where g.id = guarantee_id and g.project_id = guarantee_evidence.project_id));
-- Sin update ni delete directos: se elimina con eliminar_evidencia_garantia(), que exige motivo
revoke update, delete on public.guarantee_evidence from anon, authenticated;

-- 2. Archivos en el bucket: subir solo a <proyecto>/garantias/<garantía de ese proyecto>/<archivo>.
-- Las políticas de lectura y borrado existentes (aura_documentos_select / _delete) ya cubren la carpeta del proyecto.
create policy "aura_documentos_insert_garantias" on storage.objects for insert to authenticated
  with check (bucket_id = 'aura-documentos' and public.puede_editar((storage.foldername(name))[1])
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[2] = 'garantias'
    and exists (select 1 from public.project_guarantees g
                 where g.id::text = (storage.foldername(name))[3] and g.project_id = (storage.foldername(name))[1]));

-- 3. Eliminar con motivo ------------------------------------------------------------------
create or replace function public.eliminar_evidencia_garantia(p_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila public.guarantee_evidence;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 500);
begin
  select * into v_fila from public.guarantee_evidence where id = p_id;
  if v_fila.id is null or not public.puede_editar(v_fila.project_id) then
    raise exception 'No se encontró el documento o no tienes permiso para eliminarlo.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  if v_motivo = '' then
    raise exception 'Para eliminar un documento se requiere un motivo.' using errcode = 'P0001', hint = 'motivo_obligatorio';
  end if;
  perform set_config('auragrid.motivo', v_motivo, true);
  delete from public.guarantee_evidence where id = p_id;
  perform set_config('auragrid.motivo', '', true);
  return v_fila.ruta;
end;
$$;
revoke execute on function public.eliminar_evidencia_garantia(uuid, text) from public, anon;
grant execute on function public.eliminar_evidencia_garantia(uuid, text) to authenticated;

-- 4. Historial ------------------------------------------------------------------------------
alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
alter table public.project_change_log
  add constraint project_change_log_campo_check check (campo in (
    'estado', 'fecha', 'responsable', 'titulo', 'alta', 'baja',
    'baja_garantia', 'garantia_concepto', 'garantia_tipo', 'garantia_beneficiario', 'garantia_categoria',
    'proyecto_nombre', 'proyecto_capacidad', 'proyecto_estado', 'proyecto_capex', 'proyecto_rtb', 'proyecto_margen',
    'proyecto_archivo', 'supuesto',
    'miembro_alta', 'miembro_rol', 'miembro_baja', 'miembro_limite', 'evidencia_alta', 'evidencia_baja',
    'garantia_doc_alta', 'garantia_doc_baja'));

create or replace function public.registrar_evidencia_garantia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila public.guarantee_evidence := case when tg_op = 'DELETE' then old else new end;
  v_nombre text;
begin
  -- Si se borra el proyecto completo (cascada) no se registra
  if not exists (select 1 from public.solar_projects where id = v_fila.project_id) then
    return v_fila;
  end if;
  select tipo || ' ' || beneficiario into v_nombre from public.project_guarantees where id = v_fila.guarantee_id;
  insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
  values (v_fila.project_id, 'Garantía: ' || coalesce(v_nombre, 'sin nombre'),
          case when tg_op = 'DELETE' then 'garantia_doc_baja' else 'garantia_doc_alta' end,
          case when tg_op = 'DELETE' then v_fila.nombre end,
          case when tg_op = 'INSERT' then v_fila.nombre end,
          case when tg_op = 'DELETE' then nullif(btrim(coalesce(current_setting('auragrid.motivo', true), '')), '') else v_fila.nota end,
          'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
  return v_fila;
end;
$$;
revoke execute on function public.registrar_evidencia_garantia() from public, anon, authenticated;
drop trigger if exists guarantee_evidence_historial on public.guarantee_evidence;
create trigger guarantee_evidence_historial after insert or delete on public.guarantee_evidence
  for each row execute function public.registrar_evidencia_garantia();

-- Reversión: drop trigger guarantee_evidence_historial; drop function registrar_evidencia_garantia(),
-- eliminar_evidencia_garantia(uuid, text); drop policy aura_documentos_insert_garantias on storage.objects;
-- borrar los archivos de <proyecto>/garantias/ con la API de Storage; drop table guarantee_evidence;
-- restricción de campo: la de 20261015100000.
