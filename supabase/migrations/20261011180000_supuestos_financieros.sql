-- Supuestos de producción, ingresos, costos, deuda e impuestos por proyecto (uno por proyecto).
-- La app calcula con ellos la TIR de proyecto y de equity, el DSCR (P50 y P90) y el LCOE (src/lib/rentabilidad.ts),
-- en lugar de los valores fijos que había antes.
--
-- Valores iniciales FICTICIOS para Alpha I (triple verificación, 2026-10-11):
--   * Rendimiento fijo 1,810 kWh/kWp: PVGIS (JRC), Hermosillo, NSRDB y ERA5, 14 % de pérdidas.
--   * Un eje +20 % sobre fija: PVGIS da +28–30 % ideal; en campo, con backtracking y separación de filas,
--     15–25 % (Solar Power World, NREL). Dos ejes +8 % sobre un eje (fuentes de menor calidad).
--   * Sobrecosto un eje USD 0.07/Wdc: NREL Cost Benchmarks 2016–2021 (USD 0.06–0.08/Wdc).
--     Dos ejes USD 0.15/Wdc sobre un eje y O&M extra: estimaciones sin fuente sólida; reemplazar con cotización.
--   * Estructura base = un eje: estándar de mercado en parques de este tamaño; el CAPEX registrado no permite saberlo.
--   * PPA, mercado, deuda, ISR: supuestos de trabajo pendientes de term sheet, oferta y asesor fiscal.

create table if not exists public.project_financial_assumptions (
  project_id                    text primary key references public.solar_projects (id) on delete cascade,
  estructura_base               text    not null default 'un_eje' check (estructura_base in ('fija', 'un_eje', 'dos_ejes')),
  estructura_seleccionada       text    not null default 'un_eje' check (estructura_seleccionada in ('fija', 'un_eje', 'dos_ejes')),
  rendimiento_fija_kwh_kwp      numeric not null default 1810  check (rendimiento_fija_kwh_kwp between 500 and 3500),
  ganancia_un_eje_pct           numeric not null default 20    check (ganancia_un_eje_pct between 0 and 60),
  ganancia_dos_ejes_pct         numeric not null default 8     check (ganancia_dos_ejes_pct between 0 and 40),
  sobrecosto_un_eje_usd_wdc     numeric not null default 0.07  check (sobrecosto_un_eje_usd_wdc between 0 and 1),
  sobrecosto_dos_ejes_usd_wdc   numeric not null default 0.15  check (sobrecosto_dos_ejes_usd_wdc between 0 and 2),
  om_extra_un_eje_usd_kwdc      numeric not null default 2     check (om_extra_un_eje_usd_kwdc between 0 and 50),
  om_extra_dos_ejes_usd_kwdc    numeric not null default 5     check (om_extra_dos_ejes_usd_kwdc between 0 and 50),
  p90_pct                       numeric not null default 92    check (p90_pct between 50 and 100),
  degradacion_pct               numeric not null default 0.5   check (degradacion_pct between 0 and 5),
  vida_util_anos                integer not null default 30    check (vida_util_anos between 5 and 50),
  meses_construccion            integer not null default 12    check (meses_construccion between 1 and 60),
  ppa_precio_usd_mwh            numeric not null default 42    check (ppa_precio_usd_mwh between 0 and 500),
  ppa_porcentaje                numeric not null default 80    check (ppa_porcentaje between 0 and 100),
  ppa_plazo_anos                integer not null default 15    check (ppa_plazo_anos between 0 and 50),
  ppa_escalamiento_pct          numeric not null default 0     check (ppa_escalamiento_pct between -10 and 20),
  mercado_precio_usd_mwh        numeric not null default 40    check (mercado_precio_usd_mwh between 0 and 500),
  mercado_escalamiento_pct      numeric not null default 1     check (mercado_escalamiento_pct between -10 and 20),
  cel_precio_usd_mwh            numeric not null default 0     check (cel_precio_usd_mwh between 0 and 200),
  opex_anual_usd                numeric not null default 600000 check (opex_anual_usd >= 0),
  arrendamiento_anual_usd       numeric not null default 125000 check (arrendamiento_anual_usd >= 0),
  opex_escalamiento_pct         numeric not null default 2     check (opex_escalamiento_pct between -10 and 20),
  tasa_interes_pct              numeric not null default 8     check (tasa_interes_pct between 0 and 30),
  plazo_deuda_anos              integer not null default 18    check (plazo_deuda_anos between 1 and 40),
  dscr_minimo_requerido         numeric not null default 1.30  check (dscr_minimo_requerido between 0.5 and 5),
  isr_pct                       numeric not null default 30    check (isr_pct between 0 and 60),
  depreciacion_ano1_pct         numeric not null default 100   check (depreciacion_ano1_pct between 0 and 100),
  tasa_descuento_pct            numeric not null default 8     check (tasa_descuento_pct between 0 and 30),
  updated_at                    timestamptz not null default now()
);

alter table public.project_financial_assumptions enable row level security;

-- Solo el dueño del proyecto (solar_projects.owner_id), igual que el resto de las tablas de proyecto
create policy "project_financial_assumptions_select_propios" on public.project_financial_assumptions
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_financial_assumptions_insert_propios" on public.project_financial_assumptions
  for insert to authenticated
  with check (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_financial_assumptions_update_propios" on public.project_financial_assumptions
  for update to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_financial_assumptions_delete_propios" on public.project_financial_assumptions
  for delete to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));

-- Supuestos iniciales para Alpha I (todos los valores por defecto). Beta II queda sin supuestos (N/D).
insert into public.project_financial_assumptions (project_id)
select 'alpha-i-50mw'
where exists (select 1 from public.solar_projects where id = 'alpha-i-50mw')
on conflict (project_id) do nothing;

-- Reversión:
--   drop table if exists public.project_financial_assumptions;
