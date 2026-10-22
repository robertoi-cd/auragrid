-- Borrar un proyecto: solo el dueño y solo si está archivado. Antes, la base dejaba al dueño borrar cualquier proyecto
-- suyo, también uno activo (solo la app pedía que estuviera archivado). Ahora lo exige el servidor: un proyecto activo
-- no se puede borrar ni desde la app ni directamente contra la API; primero hay que archivarlo.
-- No cambia la lectura, la creación ni la edición (archivar y restaurar siguen igual).

drop policy if exists solar_projects_delete_dueno on public.solar_projects;
create policy solar_projects_delete_dueno on public.solar_projects
  for delete to authenticated
  using (owner_id = (select auth.uid()) and is_archived);

-- Reversión (la política anterior, de 20261014100000_equipo_y_evidencias):
--   drop policy if exists solar_projects_delete_dueno on public.solar_projects;
--   create policy solar_projects_delete_dueno on public.solar_projects
--     for delete to authenticated using (owner_id = (select auth.uid()));
