-- Parámetros de interconexión y operación que guarda NewProjectModal.jsx.
-- Columnas opcionales: los proyectos existentes quedan con NULL.
alter table public.solar_projects
  add column if not exists interconnection_cost numeric,
  add column if not exists opex_annual numeric,
  add column if not exists land_lease_cost numeric,
  add column if not exists transmission_distance_km numeric;
