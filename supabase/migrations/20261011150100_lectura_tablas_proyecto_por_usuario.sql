-- Las 7 tablas que se podían leer sin sesión. AuraGrid no las lee hoy; ningún dato se borra.

-- Catálogo general (tarifas CRE): solo usuarios con sesión.
alter policy "tariffs_read_policy" on public.energy_tariffs to authenticated;

-- Datos de proyecto: solo el dueño del proyecto en solar_projects (plant_id = solar_projects.id).
-- Las filas de ejemplo con plant_id 'default' quedan sin dueño y dejan de ser visibles.
drop policy "Lectura pública construction_cash_flows" on public.construction_cash_flows;
create policy "construction_cash_flows_select_propios" on public.construction_cash_flows
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = plant_id and sp.owner_id = (select auth.uid())));

drop policy "Lectura pública debt_drawdown_schedules" on public.debt_drawdown_schedules;
create policy "debt_drawdown_schedules_select_propios" on public.debt_drawdown_schedules
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = plant_id and sp.owner_id = (select auth.uid())));

drop policy "Permitir lectura pública de líneas base financieras" on public.project_financial_baselines;
create policy "project_financial_baselines_select_propios" on public.project_financial_baselines
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = plant_id and sp.owner_id = (select auth.uid())));

drop policy "Permitir lectura pública de tracker RTB" on public.project_rtb_tracker;
create policy "project_rtb_tracker_select_propios" on public.project_rtb_tracker
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = plant_id and sp.owner_id = (select auth.uid())));

drop policy "Permitir lectura pública de hitos de estudio" on public.project_study_milestones;
create policy "project_study_milestones_select_propios" on public.project_study_milestones
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = plant_id and sp.owner_id = (select auth.uid())));

-- organizations: no hay relación usuario-organización, así que se cierra la lectura desde el navegador
-- hasta que exista. Los datos se conservan.
drop policy "org_read_policy" on public.organizations;

-- Reversión: borrar las *_select_propios, `alter policy "tariffs_read_policy" ... to public`, y recrear
-- `for select to public using (true)` con los nombres originales:
--   "Lectura pública construction_cash_flows", "Lectura pública debt_drawdown_schedules",
--   "Permitir lectura pública de líneas base financieras", "Permitir lectura pública de tracker RTB",
--   "Permitir lectura pública de hitos de estudio", "org_read_policy".
