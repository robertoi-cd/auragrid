-- Equipo por proyecto (dueño, editor, lector) y evidencia documental por entregable.
-- * project_members: quién más accede a un proyecto y con qué rol. El dueño sigue siendo solar_projects.owner_id.
--     - editor: ve y edita todo lo del proyecto (entregables, garantías, supuestos, cronograma, datos del proyecto),
--       pero no puede archivarlo, borrarlo ni administrar el equipo.
--     - lector (p. ej. un banco): solo lectura de todo, incluido el historial y las evidencias; puede usar el asistente.
-- * Las 26 políticas "solo el dueño" pasan a usar puede_ver() / puede_editar().
-- * project_access_log: registro de accesos de los miembros (el dueño lo consulta).
-- * deliverable_evidence + bucket privado "aura-documentos": documentos que respaldan cada entregable, en
--   <project_id>/<deliverable_id>/<archivo>; 50 MB; PDF, DOCX, XLSX y XML; no se modifican una vez subidos; se
--   descargan solo con enlaces firmados. Lector lee; editor y dueño suben y borran (borrar exige motivo).
-- * Se cierra el bucket público "aura-reports" (vacío y sin uso; se borra después desde el panel) y se vacía su
--   enlace roto en project_reports.
-- * El historial registra altas, cambios de rol y bajas del equipo, y los documentos subidos o eliminados
--   (archivo, entregable, usuario y motivo al eliminar).

-- 1. Equipo -----------------------------------------------------------------------------
create table if not exists public.project_members (
  project_id   text not null references public.solar_projects (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  rol          text not null check (rol in ('editor', 'lector')),
  agregado_por uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on public.project_members (user_id);
alter table public.project_members enable row level security;

-- Rol del usuario actual en un proyecto: 'dueno', 'editor', 'lector' o null. security definer para que las
-- políticas puedan consultarlo sin depender de las políticas de project_members.
create or replace function public.rol_en_proyecto(p_project_id text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from public.solar_projects where id = p_project_id and owner_id = auth.uid()) then 'dueno'
    else (select rol from public.project_members where project_id = p_project_id and user_id = auth.uid())
  end;
$$;

-- Devuelven siempre true o false (nunca null): un null dentro de "if not …" saltaría la verificación
create or replace function public.puede_ver(p_project_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.rol_en_proyecto(p_project_id) is not null; $$;

create or replace function public.puede_editar(p_project_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.rol_en_proyecto(p_project_id) in ('dueno', 'editor'), false); $$;

create or replace function public.es_dueno(p_project_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.rol_en_proyecto(p_project_id) = 'dueno', false); $$;

revoke execute on function public.rol_en_proyecto(text), public.puede_ver(text), public.puede_editar(text), public.es_dueno(text) from public, anon;
grant execute on function public.rol_en_proyecto(text), public.puede_ver(text), public.puede_editar(text), public.es_dueno(text) to authenticated;

-- Los miembros ven quién más está en el proyecto; solo el dueño lo administra (con las funciones de abajo)
create policy "project_members_select" on public.project_members for select to authenticated using (public.puede_ver(project_id));
create policy "project_members_delete_dueno" on public.project_members for delete to authenticated using (public.es_dueno(project_id));

-- 2. Políticas de las tablas del proyecto ------------------------------------------------
drop policy if exists "solar_projects_select_propios" on public.solar_projects;
drop policy if exists "solar_projects_update_propios" on public.solar_projects;
drop policy if exists "solar_projects_delete_propios" on public.solar_projects;
-- (insert sigue igual: owner_id = auth.uid())
create policy "solar_projects_select_equipo" on public.solar_projects for select to authenticated using (public.puede_ver(id));
create policy "solar_projects_update_equipo" on public.solar_projects for update to authenticated using (public.puede_editar(id)) with check (public.puede_editar(id));
create policy "solar_projects_delete_dueno" on public.solar_projects for delete to authenticated using (owner_id = (select auth.uid()));

-- Un editor no puede cambiar el dueño ni archivar o restaurar el proyecto
create or replace function public.proteger_proyecto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'El dueño del proyecto no se puede cambiar.' using errcode = '42501', hint = 'solo_dueno';
  end if;
  if new.is_archived is distinct from old.is_archived and not public.es_dueno(old.id) and auth.uid() is not null then
    raise exception 'Solo el dueño puede archivar o restaurar el proyecto.' using errcode = '42501', hint = 'solo_dueno';
  end if;
  return new;
end;
$$;
drop trigger if exists solar_projects_proteger on public.solar_projects;
create trigger solar_projects_proteger before update on public.solar_projects for each row execute function public.proteger_proyecto();

do $$
declare
  t text;
  sufijo text;
begin
  foreach t in array array['project_deliverables', 'project_guarantees', 'project_cash_movements', 'project_financial_assumptions'] loop
    sufijo := case when t = 'project_guarantees' then 'propias' else 'propios' end;
    execute format('drop policy if exists %I on public.%I', t || '_select_' || sufijo, t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_' || sufijo, t);
    execute format('drop policy if exists %I on public.%I', t || '_update_' || sufijo, t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_' || sufijo, t);
    execute format('create policy %I on public.%I for select to authenticated using (public.puede_ver(project_id))', t || '_select_equipo', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.puede_editar(project_id))', t || '_insert_equipo', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.puede_editar(project_id)) with check (public.puede_editar(project_id))', t || '_update_equipo', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.puede_editar(project_id))', t || '_delete_equipo', t);
  end loop;
end $$;

drop policy if exists "project_guarantee_renewals_select_propias" on public.project_guarantee_renewals;
drop policy if exists "project_guarantee_renewals_insert_propias" on public.project_guarantee_renewals;
create policy "project_guarantee_renewals_select_equipo" on public.project_guarantee_renewals for select to authenticated
  using (exists (select 1 from public.project_guarantees g where g.id = guarantee_id and public.puede_ver(g.project_id)));
create policy "project_guarantee_renewals_insert_equipo" on public.project_guarantee_renewals for insert to authenticated
  with check (renovado_por = (select auth.uid())
    and exists (select 1 from public.project_guarantees g where g.id = guarantee_id and public.puede_editar(g.project_id)));

drop policy if exists "project_change_log_select_propios" on public.project_change_log;
create policy "project_change_log_select_equipo" on public.project_change_log for select to authenticated using (public.puede_ver(project_id));

-- Chat: cada quien ve y borra solo sus mensajes; puede escribir en los proyectos que ve (incluido un lector)
drop policy if exists "assistant_messages_insert_propios" on public.assistant_messages;
create policy "assistant_messages_insert_equipo" on public.assistant_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and public.puede_ver(project_id));

-- 3. Administración del equipo (solo el dueño) --------------------------------------------
alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
alter table public.project_change_log
  add constraint project_change_log_campo_check check (campo in (
    'estado', 'fecha', 'responsable', 'titulo', 'alta', 'baja',
    'baja_garantia', 'garantia_concepto', 'garantia_tipo', 'garantia_beneficiario', 'garantia_categoria',
    'proyecto_nombre', 'proyecto_capacidad', 'proyecto_estado', 'proyecto_capex', 'proyecto_rtb', 'proyecto_margen',
    'proyecto_archivo', 'supuesto',
    'miembro_alta', 'miembro_rol', 'miembro_baja', 'evidencia_alta', 'evidencia_baja'));

-- Agrega (o cambia el rol de) un miembro por su correo. La persona debe tener cuenta en AuraGrid (invitada antes).
create or replace function public.agregar_miembro(p_project_id text, p_correo text, p_rol text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid;
  v_anterior text;
  v_correo text := lower(btrim(coalesce(p_correo, '')));
begin
  if not public.es_dueno(p_project_id) then
    raise exception 'Solo el dueño del proyecto puede administrar el equipo.' using errcode = '42501', hint = 'solo_dueno';
  end if;
  if p_rol not in ('editor', 'lector') then
    raise exception 'El rol debe ser editor o lector.' using errcode = '22023', hint = 'rol_invalido';
  end if;
  select id into v_usuario from auth.users where lower(email) = v_correo;
  if v_usuario is null then
    raise exception 'No hay una cuenta de AuraGrid con ese correo. Invítala primero.' using errcode = 'P0002', hint = 'sin_cuenta';
  end if;
  if v_usuario = auth.uid() then
    raise exception 'Ya eres el dueño del proyecto.' using errcode = '22023', hint = 'es_dueno';
  end if;
  select rol into v_anterior from public.project_members where project_id = p_project_id and user_id = v_usuario;
  insert into public.project_members (project_id, user_id, rol, agregado_por) values (p_project_id, v_usuario, p_rol, auth.uid())
    on conflict (project_id, user_id) do update set rol = excluded.rol;
  if v_anterior is null or v_anterior <> p_rol then
    insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
    values (p_project_id, 'Equipo: ' || v_correo, case when v_anterior is null then 'miembro_alta' else 'miembro_rol' end,
            v_anterior, p_rol, 'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
  end if;
end;
$$;

create or replace function public.quitar_miembro(p_project_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol text;
  v_correo text;
begin
  if not public.es_dueno(p_project_id) then
    raise exception 'Solo el dueño del proyecto puede administrar el equipo.' using errcode = '42501', hint = 'solo_dueno';
  end if;
  delete from public.project_members where project_id = p_project_id and user_id = p_user_id returning rol into v_rol;
  if v_rol is null then
    raise exception 'Esa persona no es miembro del proyecto.' using errcode = 'P0002', hint = 'no_miembro';
  end if;
  select email into v_correo from auth.users where id = p_user_id;
  insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
  values (p_project_id, 'Equipo: ' || coalesce(v_correo, p_user_id::text), 'miembro_baja', v_rol, null, 'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
end;
$$;

-- Miembros con su correo (auth.users no es legible desde la app); cualquiera que vea el proyecto los ve
create or replace function public.miembros_proyecto(p_project_id text)
returns table (user_id uuid, correo text, rol text, desde timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sp.owner_id, u.email::text, 'dueno', sp.created_at
    from public.solar_projects sp join auth.users u on u.id = sp.owner_id
   where sp.id = p_project_id and public.puede_ver(p_project_id)
  union all
  select m.user_id, u.email::text, m.rol, m.created_at
    from public.project_members m join auth.users u on u.id = m.user_id
   where m.project_id = p_project_id and public.puede_ver(p_project_id)
  order by 4;
$$;

revoke execute on function public.agregar_miembro(text, text, text), public.quitar_miembro(text, uuid), public.miembros_proyecto(text) from public, anon;
grant execute on function public.agregar_miembro(text, text, text), public.quitar_miembro(text, uuid), public.miembros_proyecto(text) to authenticated;

-- 4. Registro de accesos de los miembros (como máximo uno por hora y persona) -------------------
create table if not exists public.project_access_log (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references public.solar_projects (id) on delete cascade,
  user_id     uuid not null,
  user_email  text,
  rol         text not null,
  accedido_en timestamptz not null default now()
);
create index if not exists project_access_log_proyecto_idx on public.project_access_log (project_id, accedido_en desc);
alter table public.project_access_log enable row level security;
create policy "project_access_log_select_dueno" on public.project_access_log for select to authenticated using (public.es_dueno(project_id));
revoke insert, update, delete on public.project_access_log from anon, authenticated;

create or replace function public.registrar_acceso(p_project_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol text := public.rol_en_proyecto(p_project_id);
begin
  -- Solo se registran los miembros (el dueño no); un acceso por hora y persona
  if v_rol in ('editor', 'lector') and not exists (
    select 1 from public.project_access_log
     where project_id = p_project_id and user_id = auth.uid() and accedido_en > now() - interval '1 hour') then
    insert into public.project_access_log (project_id, user_id, user_email, rol)
    values (p_project_id, auth.uid(), nullif(auth.jwt() ->> 'email', ''), v_rol);
  end if;
end;
$$;
revoke execute on function public.registrar_acceso(text) from public, anon;
grant execute on function public.registrar_acceso(text) to authenticated;

-- 5. Documentos de evidencia por entregable (bucket privado "aura-documentos") ------------------
-- El bucket público "aura-reports" está vacío y nada lo usa. Supabase no permite borrar buckets con SQL (solo con su
-- API o el panel): aquí se cierra (privado, sin políticas = nadie puede leer ni subir) y se borra desde el panel,
-- Storage → aura-reports → Delete bucket. Su único rastro, un enlace público roto en la tabla heredada
-- project_reports, se vacía (no cambia la estructura de la tabla).
update storage.buckets set public = false where id = 'aura-reports';
-- storage_url es obligatoria (not null): se deja vacía
update public.project_reports set storage_url = '' where storage_url like '%/storage/v1/object/public/aura-reports/%';

-- Privado; 50 MB por archivo; PDF, DOCX, XLSX y XML. Sin política de update: un archivo subido no se modifica.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aura-documentos', 'aura-documentos', false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/xml', 'text/xml'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.deliverable_evidence (
  id               uuid primary key default gen_random_uuid(),
  project_id       text not null references public.solar_projects (id) on delete cascade,
  -- Un entregable con documentos no se puede eliminar: primero se eliminan sus documentos
  deliverable_id   uuid not null references public.project_deliverables (id) on delete restrict,
  ruta             text not null unique,
  nombre           text not null check (length(btrim(nombre)) between 1 and 200),
  tamano           bigint not null check (tamano > 0 and tamano <= 52428800),
  tipo_mime        text not null check (tipo_mime in ('application/pdf',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml', 'text/xml')),
  nota             text check (length(nota) <= 500),
  -- Quién subió el archivo (lo fija la base; no lo puede indicar el navegador)
  subido_por       uuid not null default auth.uid(),
  subido_por_email text default nullif(auth.jwt() ->> 'email', ''),
  subido_en        timestamptz not null default now(),
  -- Ruta <project_id>/<deliverable_id>/<archivo>, sin subcarpetas
  check (ruta like project_id || '/' || deliverable_id::text || '/%' and ruta not like project_id || '/' || deliverable_id::text || '/%/%')
);
create index if not exists deliverable_evidence_entregable_idx on public.deliverable_evidence (deliverable_id);
alter table public.deliverable_evidence enable row level security;

create policy "deliverable_evidence_select" on public.deliverable_evidence for select to authenticated using (public.puede_ver(project_id));
create policy "deliverable_evidence_insert" on public.deliverable_evidence for insert to authenticated
  with check (public.puede_editar(project_id) and subido_por = (select auth.uid())
    and exists (select 1 from public.project_deliverables d where d.id = deliverable_id and d.project_id = deliverable_evidence.project_id));
-- Sin update ni delete directos: se elimina con eliminar_evidencia(), que exige motivo
revoke update on public.deliverable_evidence from anon, authenticated;

-- Archivos del bucket: mismos permisos que su proyecto (1.ª carpeta = project_id; 2.ª = un entregable de ese proyecto)
create policy "aura_documentos_select" on storage.objects for select to authenticated
  using (bucket_id = 'aura-documentos' and public.puede_ver((storage.foldername(name))[1]));
create policy "aura_documentos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'aura-documentos' and public.puede_editar((storage.foldername(name))[1])
    and array_length(storage.foldername(name), 1) = 2
    and exists (select 1 from public.project_deliverables d
                 where d.id::text = (storage.foldername(name))[2] and d.project_id = (storage.foldername(name))[1]));
create policy "aura_documentos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'aura-documentos' and public.puede_editar((storage.foldername(name))[1]));

-- Eliminar un documento: exige motivo y permiso de edición; devuelve la ruta para borrar el archivo con la API de Storage
create or replace function public.eliminar_evidencia(p_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila public.deliverable_evidence;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 500);
begin
  select * into v_fila from public.deliverable_evidence where id = p_id;
  if v_fila.id is null or not public.puede_editar(v_fila.project_id) then
    raise exception 'No se encontró el documento o no tienes permiso para eliminarlo.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  if v_motivo = '' then
    raise exception 'Para eliminar un documento se requiere un motivo.' using errcode = 'P0001', hint = 'motivo_obligatorio';
  end if;
  perform set_config('auragrid.motivo', v_motivo, true);
  delete from public.deliverable_evidence where id = p_id;
  perform set_config('auragrid.motivo', '', true);
  return v_fila.ruta;
end;
$$;
revoke execute on function public.eliminar_evidencia(uuid, text) from public, anon;
grant execute on function public.eliminar_evidencia(uuid, text) to authenticated;

-- Historial: cada documento subido o eliminado (archivo, entregable, usuario y, al eliminar, el motivo)
create or replace function public.registrar_evidencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila public.deliverable_evidence := case when tg_op = 'DELETE' then old else new end;
  v_titulo text;
begin
  -- Si se borra el proyecto completo (cascada) no se registra
  if not exists (select 1 from public.solar_projects where id = v_fila.project_id) then
    return v_fila;
  end if;
  select titulo into v_titulo from public.project_deliverables where id = v_fila.deliverable_id;
  insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email)
  values (v_fila.project_id, v_fila.deliverable_id, coalesce(v_titulo, 'Entregable'),
          case when tg_op = 'DELETE' then 'evidencia_baja' else 'evidencia_alta' end,
          case when tg_op = 'DELETE' then v_fila.nombre end,
          case when tg_op = 'INSERT' then v_fila.nombre end,
          case when tg_op = 'DELETE' then nullif(btrim(coalesce(current_setting('auragrid.motivo', true), '')), '') else v_fila.nota end,
          'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
  return v_fila;
end;
$$;
revoke execute on function public.registrar_evidencia() from public, anon, authenticated;
drop trigger if exists deliverable_evidence_historial on public.deliverable_evidence;
create trigger deliverable_evidence_historial after insert or delete on public.deliverable_evidence
  for each row execute function public.registrar_evidencia();

-- Reversión (resumen): borrar las políticas *_equipo / aura_documentos_* y volver a crear las *_propios/_propias de
-- las migraciones 20261011140000, 20261011150100, 20261011160000, 20261011180000, 20261011200000 y 20261011210000;
-- drop table project_access_log, deliverable_evidence, project_members; drop functions agregar_miembro,
-- quitar_miembro, miembros_proyecto, registrar_acceso, eliminar_evidencia, registrar_evidencia, proteger_proyecto,
-- rol_en_proyecto, puede_ver, puede_editar, es_dueno; vaciar y borrar el bucket "aura-documentos" (con la API de
-- Storage); restricción de campo: la de 20261013110000. "aura-reports" estaba vacío; no hay datos que restaurar.
