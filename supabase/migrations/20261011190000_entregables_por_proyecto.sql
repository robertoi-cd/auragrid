-- Entregables y fecha RTB por proyecto. Antes, todos los proyectos mostraban los entregables, la fecha RTB
-- y el cronograma de Alpha I (datos fijos en el código) y los cambios de estado no se guardaban.
--   * solar_projects.es_ejemplo: proyectos con datos de ejemplo (Alpha I y Beta II). La app los marca "Ejemplo".
--   * solar_projects.fecha_rtb: RTB objetivo que captura el usuario (null = sin definir).
--   * project_deliverables: entregables por proyecto, con RLS por dueño como las demás tablas de proyecto.
-- Los proyectos que no son ejemplo reciben la plantilla: todo "pendiente", sin fechas, responsables genéricos.

alter table public.solar_projects
  add column if not exists es_ejemplo boolean not null default false,
  add column if not exists fecha_rtb date;

update public.solar_projects
  set es_ejemplo = true, fecha_rtb = coalesce(fecha_rtb, date '2027-03-31')
  where id in ('alpha-i-50mw', 'beta-ii-100mw');

create table if not exists public.project_deliverables (
  id            uuid primary key default gen_random_uuid(),
  project_id    text not null references public.solar_projects (id) on delete cascade,
  frente        text not null,
  frente_orden  integer not null,
  orden         integer not null,
  titulo        text not null,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'curso', 'completo', 'bloqueado')),
  responsable   text not null default '',
  fecha         date,
  updated_at    timestamptz not null default now(),
  unique (project_id, titulo)
);
create index if not exists project_deliverables_project_id_idx on public.project_deliverables (project_id);

alter table public.project_deliverables enable row level security;

create policy "project_deliverables_select_propios" on public.project_deliverables
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_deliverables_insert_propios" on public.project_deliverables
  for insert to authenticated
  with check (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_deliverables_update_propios" on public.project_deliverables
  for update to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_deliverables_delete_propios" on public.project_deliverables
  for delete to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));

-- Entregables de los proyectos existentes: ejemplo (Alpha I, Beta II) o plantilla vacía (el resto).
-- Catálogo generado desde src/lib/datosProyecto.js (mismos títulos y orden).
with catalogo (frente, frente_orden, orden, titulo, responsable, estado_ejemplo, responsable_ejemplo, fecha_ejemplo) as (
  values
    ('Terreno', 0, 0, 'Contrato de arrendamiento a 30 años', 'Notaría', 'completo', 'Notaría', date '2026-03-12'),
    ('Terreno', 0, 1, 'Inscripción en Registro Público', 'Registro Público de la Propiedad', 'completo', 'RPP Sonora', date '2026-04-20'),
    ('Terreno', 0, 2, 'Levantamiento topográfico y deslinde', 'Topógrafo', 'completo', 'Topógrafo', date '2026-05-08'),
    ('Ambiental', 1, 0, 'MIA modalidad regional presentada', 'SEMARNAT', 'completo', 'SEMARNAT', date '2026-06-02'),
    ('Ambiental', 1, 1, 'Resolutivo de MIA', 'SEMARNAT', 'curso', 'SEMARNAT', date '2026-12-15'),
    ('Ambiental', 1, 2, 'Estudio técnico justificativo (cambio de uso de suelo)', 'SEMARNAT', 'pendiente', 'SEMARNAT', date '2027-01-20'),
    ('Social', 2, 0, 'EVIS presentada', 'SENER', 'completo', 'SENER', date '2026-06-30'),
    ('Social', 2, 1, 'Resolutivo de EVIS', 'SENER', 'curso', 'SENER', date '2026-11-30'),
    ('Interconexión', 3, 0, 'Solicitud y estudio de impacto', 'CENACE', 'completo', 'CENACE', date '2026-02-15'),
    ('Interconexión', 3, 1, 'Estudio de instalaciones', 'CENACE', 'curso', 'CENACE', date '2026-11-20'),
    ('Interconexión', 3, 2, 'Contrato de interconexión', 'CENACE / CFE', 'pendiente', 'CENACE / CFE', date '2027-02-28'),
    ('Permisos', 4, 0, 'Licencia de uso de suelo', 'Municipio', 'completo', 'Municipio', date '2026-05-30'),
    ('Permisos', 4, 1, 'Permiso de generación', 'CNE (antes CRE)', 'curso', 'CNE (antes CRE)', date '2027-01-15'),
    ('Permisos', 4, 2, 'Licencia de construcción', 'Municipio', 'pendiente', 'Municipio', date '2027-02-10'),
    ('Financiamiento y garantías', 5, 0, 'Term sheet firmado', 'Banco', 'completo', 'Banco', date '2026-07-01'),
    ('Financiamiento y garantías', 5, 1, 'Due diligence técnica y legal', 'Asesores del banco', 'completo', 'Asesores del banco', date '2026-09-15'),
    ('Financiamiento y garantías', 5, 2, 'Aprobación de crédito tramo 2', 'Comité de crédito', 'curso', 'Comité de crédito', date '2026-12-10'),
    ('Financiamiento y garantías', 5, 3, 'Garantías vigentes hasta RTB', 'Afianzadora', 'bloqueado', 'Afianzadora', date '2026-12-31'),
    ('Construcción', 6, 0, 'Cronograma EPC nivel 3', 'EPC', 'completo', 'EPC', date '2026-08-20'),
    ('Construcción', 6, 1, 'Aceptación del ingeniero independiente', 'Ingeniero independiente', 'curso', 'Ingeniero independiente', date '2026-12-01')
)
insert into public.project_deliverables (project_id, frente, frente_orden, orden, titulo, estado, responsable, fecha)
select sp.id, c.frente, c.frente_orden, c.orden, c.titulo,
       case when sp.es_ejemplo then c.estado_ejemplo else 'pendiente' end,
       case when sp.es_ejemplo then c.responsable_ejemplo else c.responsable end,
       case when sp.es_ejemplo then c.fecha_ejemplo else null end
from public.solar_projects sp
cross join catalogo c
on conflict (project_id, titulo) do nothing;

-- Reversión:
--   drop table if exists public.project_deliverables;
--   alter table public.solar_projects drop column if exists es_ejemplo, drop column if exists fecha_rtb;