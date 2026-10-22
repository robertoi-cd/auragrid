-- Margen por proyecto: días que las garantías deben seguir vigentes después del RTB.
-- validarProyecto(): crítica si una garantía vence antes del RTB, advertencia si vence antes de RTB + margen.
-- El entregable "Garantías vigentes hasta RTB" se completa solo si todas vencen después de RTB + margen.
-- RLS: las políticas existentes de solar_projects (solo el dueño actualiza) ya cubren esta columna.

alter table public.solar_projects
  add column if not exists margen_garantias_dias integer not null default 90
  constraint solar_projects_margen_garantias_dias_rango check (margen_garantias_dias between 0 and 365);

-- Reversión:
--   alter table public.solar_projects drop column if exists margen_garantias_dias;
