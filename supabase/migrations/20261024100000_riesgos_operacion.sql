-- Nivel bancario A: riesgos de operación y estrés en los supuestos del proyecto.
-- Todas las columnas son opcionales y sin valor por defecto: vacío = no aplica y ninguna cifra cambia.
-- * disponibilidad_pct y curtailment_pct reducen la producción P50 y P90.
-- * Reemplazo de inversores: año de operación y costo en USD/kWac nominales del año del reemplazo; reserva MMRA que se
--   fondea desde el CFADS en los N años previos (partes iguales, sin escalamiento).
-- * dscr_lockup: DSCR de bloqueo de dividendos (alerta si algún año del caso base o de un escenario queda por debajo).
-- * Penalización del EPC por retraso de la COD (escenario COD +6 meses): USD por día y tope; aplica solo con ambos.

alter table public.project_financial_assumptions
  add column if not exists disponibilidad_pct numeric check (disponibilidad_pct > 0 and disponibilidad_pct <= 100),
  add column if not exists curtailment_pct numeric check (curtailment_pct >= 0 and curtailment_pct < 100),
  add column if not exists reemplazo_inversores_ano integer check (reemplazo_inversores_ano between 1 and 60),
  add column if not exists reemplazo_inversores_usd_kwac numeric check (reemplazo_inversores_usd_kwac >= 0),
  add column if not exists mmra_anos_fondeo integer check (mmra_anos_fondeo between 1 and 30),
  add column if not exists dscr_lockup numeric check (dscr_lockup > 0 and dscr_lockup <= 5),
  add column if not exists epc_penalizacion_usd_dia numeric check (epc_penalizacion_usd_dia >= 0),
  add column if not exists epc_penalizacion_tope_usd numeric check (epc_penalizacion_tope_usd >= 0);

comment on column public.project_financial_assumptions.reemplazo_inversores_usd_kwac is 'USD por kWac, nominales del año del reemplazo (sin escalamiento).';
comment on column public.project_financial_assumptions.mmra_anos_fondeo is 'Años previos al reemplazo en que se fondea la reserva MMRA desde el CFADS, en partes iguales.';

-- Sin datos: ningún proyecto recibe valores que no capturó. El historial de supuestos registra los cambios
-- (trigger project_financial_assumptions_historial, sin cambios).

-- Reversión:
--   alter table public.project_financial_assumptions
--     drop column if exists disponibilidad_pct, drop column if exists curtailment_pct,
--     drop column if exists reemplazo_inversores_ano, drop column if exists reemplazo_inversores_usd_kwac,
--     drop column if exists mmra_anos_fondeo, drop column if exists dscr_lockup,
--     drop column if exists epc_penalizacion_usd_dia, drop column if exists epc_penalizacion_tope_usd;
