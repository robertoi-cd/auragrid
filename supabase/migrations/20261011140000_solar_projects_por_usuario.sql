-- Nota (copia pública): el correo del dueño y su UUID se reemplazaron por marcadores (el UUID nulo, 0000…). En la base real esta migración ya está aplicada con los valores originales.
-- Cada usuario solo ve, crea, modifica y borra sus propios proyectos.
-- Reemplaza las políticas de 20261011130000_solar_projects_rls.sql (cualquier usuario con sesión veía todo).

-- 1. Dueño del proyecto. Al insertar se llena solo con el usuario de la sesión.
alter table public.solar_projects
  add column if not exists owner_id uuid default auth.uid() references auth.users (id) on delete cascade;

-- Los proyectos existentes (Alpha I, Beta II) pasan a la cuenta del dueño
update public.solar_projects
  set owner_id = '00000000-0000-0000-0000-000000000000'
  where owner_id is null;

alter table public.solar_projects alter column owner_id set not null;
create index if not exists solar_projects_owner_id_idx on public.solar_projects (owner_id);

-- 2. Políticas: solo filas propias. (select auth.uid()) se evalúa una vez por consulta.
drop policy if exists "solar_projects_select_autenticados" on public.solar_projects;
drop policy if exists "solar_projects_insert_autenticados" on public.solar_projects;
drop policy if exists "solar_projects_update_autenticados" on public.solar_projects;

drop policy if exists "solar_projects_select_propios" on public.solar_projects;
create policy "solar_projects_select_propios" on public.solar_projects
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "solar_projects_insert_propios" on public.solar_projects;
create policy "solar_projects_insert_propios" on public.solar_projects
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "solar_projects_update_propios" on public.solar_projects;
create policy "solar_projects_update_propios" on public.solar_projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "solar_projects_delete_propios" on public.solar_projects;
create policy "solar_projects_delete_propios" on public.solar_projects
  for delete to authenticated using (owner_id = (select auth.uid()));
