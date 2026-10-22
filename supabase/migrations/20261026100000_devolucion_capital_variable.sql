-- Estados financieros v1: supuesto "Devolución de capital variable" (sí/no). Opcional y sin valor por defecto:
-- vacío = no (la caja que no puede salir como dividendo queda atrapada) y ninguna cifra cambia. Con sí, esa caja se
-- reembolsa como capital variable hasta el capital aportado pendiente, sujeto al lock-up.
-- No cambia la TIR de equity actual (flujo disponible), la deuda, el DSCR ni el ISR: solo los estados financieros y
-- qué TIR de distribuciones se toma como la del proyecto.

alter table public.project_financial_assumptions
  add column if not exists devolucion_capital_variable boolean;

comment on column public.project_financial_assumptions.devolucion_capital_variable is
  'Estados financieros: la caja que no puede salir como dividendo se devuelve como reembolso de capital variable (vacío = no). En una S.A.P.I. de C.V. el capital variable se reduce por acuerdo de asamblea; validar con asesor.';

-- Sin datos: ningún proyecto recibe un valor que no capturó. Las políticas RLS de la tabla y el trigger del historial
-- de supuestos (project_financial_assumptions_historial) aplican a la columna nueva sin cambios.

-- Reversión:
--   alter table public.project_financial_assumptions drop column if exists devolucion_capital_variable;
