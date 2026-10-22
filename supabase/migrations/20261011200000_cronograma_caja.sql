-- Cronograma de caja capturado por el usuario: pagos a proveedores (salidas) y fuentes de fondeo (entradas).
-- Si un proyecto tiene movimientos aquí, la app usa estos; si no, los proyectos de ejemplo usan el cronograma
-- ilustrativo y los proyectos reales quedan sin cronograma (sin montos ni fechas inventados).

create table if not exists public.project_cash_movements (
  id           uuid primary key default gen_random_uuid(),
  project_id   text not null references public.solar_projects (id) on delete cascade,
  tipo         text not null check (tipo in ('pago', 'fondo')),
  concepto     text not null check (length(trim(concepto)) > 0),
  fecha        date not null,
  monto        numeric(16, 2) not null check (monto > 0),
  estado       text not null default 'Programado',
  fuente       text check (fuente in ('equity', 'deuda')),  -- solo fondos
  confirmado   boolean not null default false,              -- solo fondos: compromiso firme (aprobado/comprometido)
  partida      text check (partida in ('equipos')),         -- solo pagos: contrato de equipos mayores
  es_anticipo  boolean not null default false,              -- solo pagos de equipos
  fondeo       text not null default '',                    -- solo pagos: con qué se paga (texto libre)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint project_cash_movements_fondo_con_fuente check ((tipo = 'fondo') = (fuente is not null)),
  constraint project_cash_movements_pago_sin_confirmado check (tipo = 'fondo' or confirmado = false),
  constraint project_cash_movements_partida_solo_pagos check (tipo = 'pago' or partida is null),
  constraint project_cash_movements_anticipo_solo_equipos check (not es_anticipo or partida = 'equipos')
);
create index if not exists project_cash_movements_project_id_idx on public.project_cash_movements (project_id);

alter table public.project_cash_movements enable row level security;

create policy "project_cash_movements_select_propios" on public.project_cash_movements
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_cash_movements_insert_propios" on public.project_cash_movements
  for insert to authenticated
  with check (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_cash_movements_update_propios" on public.project_cash_movements
  for update to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_cash_movements_delete_propios" on public.project_cash_movements
  for delete to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));

-- Sin datos iniciales: ningún proyecto recibe movimientos que no capturó.

-- Reversión:
--   drop table if exists public.project_cash_movements;
