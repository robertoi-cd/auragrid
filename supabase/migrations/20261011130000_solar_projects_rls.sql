-- solar_projects: sin sesión no hay acceso; con sesión se puede ver, crear y editar (archivar/restaurar).
-- No hay política de DELETE: la app archiva en lugar de borrar.
alter table public.solar_projects enable row level security;

drop policy if exists "solar_projects_select_autenticados" on public.solar_projects;
create policy "solar_projects_select_autenticados" on public.solar_projects
  for select to authenticated using (true);

drop policy if exists "solar_projects_insert_autenticados" on public.solar_projects;
create policy "solar_projects_insert_autenticados" on public.solar_projects
  for insert to authenticated with check (true);

drop policy if exists "solar_projects_update_autenticados" on public.solar_projects;
create policy "solar_projects_update_autenticados" on public.solar_projects
  for update to authenticated using (true) with check (true);
