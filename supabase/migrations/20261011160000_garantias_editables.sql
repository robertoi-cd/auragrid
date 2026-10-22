-- Garantías por proyecto, editables por el dueño del proyecto, con historial de renovaciones.

-- 1. Garantías ---------------------------------------------------------------
create table if not exists public.project_guarantees (
  id            uuid primary key default gen_random_uuid(),
  project_id    text not null references public.solar_projects (id) on delete cascade,
  tipo          text not null,
  beneficiario  text not null,
  emisor        text not null,
  concepto      text not null default '',
  monto         numeric(14, 2) not null check (monto > 0),
  vence         date not null,
  -- Estado operativo que captura el usuario; el riesgo (vence antes de RTB, etc.) lo calcula validarProyecto()
  estado        text not null default 'vigente' check (estado in ('vigente', 'en_renovacion', 'liberada')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists project_guarantees_project_id_idx on public.project_guarantees (project_id);

alter table public.project_guarantees enable row level security;

-- Solo el dueño del proyecto (solar_projects.owner_id) ve y edita sus garantías
create policy "project_guarantees_select_propias" on public.project_guarantees
  for select to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_guarantees_insert_propias" on public.project_guarantees
  for insert to authenticated
  with check (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_guarantees_update_propias" on public.project_guarantees
  for update to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));
create policy "project_guarantees_delete_propias" on public.project_guarantees
  for delete to authenticated
  using (exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid())));

-- 2. Historial de renovaciones (solo se agrega; no se edita ni se borra) ------
create table if not exists public.project_guarantee_renewals (
  id              uuid primary key default gen_random_uuid(),
  guarantee_id    uuid not null references public.project_guarantees (id) on delete cascade,
  vence_anterior  date not null,
  vence_nueva     date not null check (vence_nueva > vence_anterior),
  renovado_por    uuid not null default auth.uid() references auth.users (id),
  renovado_en     timestamptz not null default now()
);
create index if not exists project_guarantee_renewals_guarantee_id_idx on public.project_guarantee_renewals (guarantee_id);

alter table public.project_guarantee_renewals enable row level security;

create policy "project_guarantee_renewals_select_propias" on public.project_guarantee_renewals
  for select to authenticated
  using (exists (
    select 1 from public.project_guarantees g join public.solar_projects sp on sp.id = g.project_id
    where g.id = guarantee_id and sp.owner_id = (select auth.uid())));
create policy "project_guarantee_renewals_insert_propias" on public.project_guarantee_renewals
  for insert to authenticated
  with check (
    renovado_por = (select auth.uid())
    and exists (
      select 1 from public.project_guarantees g join public.solar_projects sp on sp.id = g.project_id
      where g.id = guarantee_id and sp.owner_id = (select auth.uid())));

-- 3. Renovación atómica: guarda la fecha anterior y actualiza el vencimiento en una sola transacción.
--    security invoker: corre con los permisos del usuario, así que RLS aplica igual que en la tabla.
create or replace function public.registrar_renovacion_garantia(p_garantia_id uuid, p_nueva_fecha date)
returns public.project_guarantees
language plpgsql
security invoker
set search_path = ''
as $$
declare
  g public.project_guarantees;
begin
  select * into g from public.project_guarantees where id = p_garantia_id for update;
  if not found then
    raise exception 'La garantía no existe o no pertenece a tus proyectos.' using errcode = '42501';
  end if;
  if p_nueva_fecha <= g.vence then
    raise exception 'La nueva fecha debe ser posterior al vencimiento actual (%).', to_char(g.vence, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  insert into public.project_guarantee_renewals (guarantee_id, vence_anterior, vence_nueva)
    values (g.id, g.vence, p_nueva_fecha);

  update public.project_guarantees
    set vence = p_nueva_fecha, estado = 'vigente', updated_at = now()
    where id = g.id
    returning * into g;

  return g;
end;
$$;

revoke execute on function public.registrar_renovacion_garantia(uuid, date) from public, anon;
grant execute on function public.registrar_renovacion_garantia(uuid, date) to authenticated;

-- 4. Datos iniciales: las 3 garantías de ejemplo que hoy están fijas en el código, para Alpha I
insert into public.project_guarantees (project_id, tipo, beneficiario, emisor, concepto, monto, vence)
select 'alpha-i-50mw', v.tipo, v.beneficiario, v.emisor, v.concepto, v.monto, v.vence
from (values
  ('Fianza',           'CENACE',               'Afianzadora (ejemplo)', 'Garantía de interconexión', 1250000::numeric, date '2027-01-31'),
  ('Carta de crédito', 'Proveedor de módulos', 'Banco (ejemplo)',       'Pago de equipos',           4800000::numeric, date '2027-06-30'),
  ('Fianza',           'Alpha I (SPV)',        'Afianzadora (ejemplo)', 'Cumplimiento EPC',          1340000::numeric, date '2027-12-31')
) as v (tipo, beneficiario, emisor, concepto, monto, vence)
where exists (select 1 from public.solar_projects where id = 'alpha-i-50mw')
  and not exists (select 1 from public.project_guarantees where project_id = 'alpha-i-50mw');

-- Reversión:
--   drop function if exists public.registrar_renovacion_garantia(uuid, date);
--   drop table if exists public.project_guarantee_renewals;
--   drop table if exists public.project_guarantees;
