-- Dimensionamiento de la deuda al estándar de project finance (deuda esculpida) y depreciación configurable.
-- Solo agrega columnas a project_financial_assumptions; no borra ni renombra nada.
--
-- Cómo se usan (src/lib/rentabilidad.ts):
--   * Servicio de cada año = el menor entre CFADS P50 ÷ dscr_minimo_requerido y CFADS P90 ÷ dscr_dimensionamiento_p90;
--     la parte de la CFADS sin contrato (mercado y CELs) se divide siempre entre dscr_mercado, también dentro del PPA.
--   * Deuda = VP del servicio, con tope de apalancamiento_max_pct sobre los usos
--     (CAPEX + intereses durante la construcción + comisión de estructuración + DSRA). Equity = usos − deuda.
--   * dscr_covenant: alerta crítica si el DSCR mínimo con P50 queda debajo; advertencia si solo con P90.
--   * Depreciación: 'ano1' = depreciacion_ano1_pct en el año 1 y el resto a la tasa anual; 'anual' = tasa anual desde el año 1.
--
-- Valores iniciales: supuestos de trabajo habituales en bancos para solar con PPA en México; confirmar con el term sheet.

alter table public.project_financial_assumptions
  add column if not exists dscr_dimensionamiento_p90   numeric not null default 1.20 check (dscr_dimensionamiento_p90 between 1 and 5),
  add column if not exists dscr_mercado                numeric not null default 1.75 check (dscr_mercado between 1 and 5),
  add column if not exists dscr_covenant               numeric not null default 1.15 check (dscr_covenant between 1 and 5),
  add column if not exists apalancamiento_max_pct      numeric not null default 70   check (apalancamiento_max_pct between 0 and 90),
  add column if not exists comision_estructuracion_pct numeric not null default 1.5  check (comision_estructuracion_pct between 0 and 10),
  add column if not exists dsra_meses                  integer not null default 6    check (dsra_meses between 0 and 24),
  add column if not exists depreciacion_esquema        text    not null default 'ano1' check (depreciacion_esquema in ('ano1', 'anual')),
  add column if not exists depreciacion_tasa_anual_pct numeric not null default 10   check (depreciacion_tasa_anual_pct > 0 and depreciacion_tasa_anual_pct <= 100);

-- La columna existente pasa a ser el DSCR de dimensionamiento con P50 (antes "covenant"); mismo valor por defecto 1.30
comment on column public.project_financial_assumptions.dscr_minimo_requerido is
  'DSCR con que se dimensiona la deuda sobre la CFADS P50 (el covenant está en dscr_covenant)';

-- Plazo de la deuda igual al del PPA por defecto (15 años)
alter table public.project_financial_assumptions alter column plazo_deuda_anos set default 15;

update public.project_financial_assumptions
set plazo_deuda_anos = 15, updated_at = now()
where project_id = 'alpha-i-50mw' and plazo_deuda_anos = 18;

-- Reversión:
--   update public.project_financial_assumptions set plazo_deuda_anos = 18 where project_id = 'alpha-i-50mw';
--   alter table public.project_financial_assumptions alter column plazo_deuda_anos set default 18;
--   comment on column public.project_financial_assumptions.dscr_minimo_requerido is null;
--   alter table public.project_financial_assumptions
--     drop column if exists dscr_dimensionamiento_p90, drop column if exists dscr_mercado, drop column if exists dscr_covenant,
--     drop column if exists apalancamiento_max_pct, drop column if exists comision_estructuracion_pct, drop column if exists dsra_meses,
--     drop column if exists depreciacion_esquema, drop column if exists depreciacion_tasa_anual_pct;
