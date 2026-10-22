-- Seguros separados del OPEX y ajustes ilustrativos de Alpha I.
-- Solo agrega una columna y actualiza la fila de Alpha I; no borra ni renombra nada.
--
--   * seguros_anual_usd: USD/año, con el mismo escalamiento que el OPEX (opex_escalamiento_pct). Por defecto 0.
--   * Alpha I (ilustrativo, validar con cotizaciones reales):
--       tasa de la deuda 7.0 % (antes 8 %), OPEX 520,000 (antes 600,000 con seguros incluidos), seguros 130,000
--       (≈ 0.28 % del CAPEX). PPA USD 42/MWh, 80 %, 15 años y CELs en 0 sin cambio.

alter table public.project_financial_assumptions
  add column if not exists seguros_anual_usd numeric not null default 0 check (seguros_anual_usd >= 0);

update public.project_financial_assumptions
set tasa_interes_pct = 7, opex_anual_usd = 520000, seguros_anual_usd = 130000, updated_at = now()
where project_id = 'alpha-i-50mw';

-- Reversión:
--   update public.project_financial_assumptions set tasa_interes_pct = 8, opex_anual_usd = 600000 where project_id = 'alpha-i-50mw';
--   alter table public.project_financial_assumptions drop column if exists seguros_anual_usd;
