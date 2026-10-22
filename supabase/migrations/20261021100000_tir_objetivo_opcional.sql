-- TIR de equity objetivo: dato que capturan los socios, sin valor por defecto.
-- Solo cambia la columna tir_equity_objetivo_pct de project_financial_assumptions: deja de ser obligatoria y
-- pierde el valor por defecto de 12. No borra ni renombra nada y no toca los valores existentes (los proyectos
-- actuales conservan el suyo). Los proyectos nuevos empiezan sin objetivo: la app no calcula el precio mínimo de
-- PPA ni la alerta de TIR y sugiere capturarlo. El check (entre 0 y 50) se conserva y acepta el valor vacío.

alter table public.project_financial_assumptions
  alter column tir_equity_objetivo_pct drop default,
  alter column tir_equity_objetivo_pct drop not null;

-- Reversión (los proyectos sin objetivo vuelven a 12):
--   update public.project_financial_assumptions set tir_equity_objetivo_pct = 12 where tir_equity_objetivo_pct is null;
--   alter table public.project_financial_assumptions
--     alter column tir_equity_objetivo_pct set default 12,
--     alter column tir_equity_objetivo_pct set not null;
