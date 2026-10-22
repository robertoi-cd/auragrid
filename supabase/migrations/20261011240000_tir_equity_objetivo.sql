-- TIR de equity objetivo para calcular el precio mínimo de PPA (src/lib/rentabilidad.ts, precioMinimoPpa).
-- Solo agrega una columna a project_financial_assumptions; no borra ni renombra nada.

alter table public.project_financial_assumptions
  add column if not exists tir_equity_objetivo_pct numeric not null default 12 check (tir_equity_objetivo_pct between 0 and 50);

-- Reversión:
--   alter table public.project_financial_assumptions drop column if exists tir_equity_objetivo_pct;
