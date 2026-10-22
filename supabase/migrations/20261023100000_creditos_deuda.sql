-- Financiamiento con varios bancos (v1): créditos de la deuda senior por proyecto.
-- * Un crédito = quién presta y con qué condiciones: banco, % de participación (entre todos suman 100 %), tasa anual
--   total, comisión de estructuración, comisión por no disposición (opcional) y estado.
-- * Los desembolsos (Tramo 1, Tramo 2 o los fondos de deuda capturados) no cambian de tabla: la app reparte cada uno
--   entre los créditos por su participación.
-- * Sin valores inventados: las condiciones pueden quedar vacías ("Sin capturar"); la app no calcula con ellas vacías.
-- * Proyectos existentes: un crédito al 100 % con su tasa y comisión actuales, aprobado y sin banco (no se inventa
--   un nombre). Ninguna cifra cambia. Las columnas tasa_interes_pct y comision_estructuracion_pct de los supuestos
--   se quedan (no se borra nada) pero quedan en desuso.

create table if not exists public.project_loans (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  text not null references public.solar_projects (id) on delete cascade,
  orden                       integer not null default 1 check (orden > 0),
  banco                       text check (banco is null or length(trim(banco)) > 0),
  participacion_pct           numeric check (participacion_pct > 0 and participacion_pct <= 100),
  tasa_anual_pct              numeric check (tasa_anual_pct >= 0 and tasa_anual_pct <= 100),
  comision_estructuracion_pct numeric check (comision_estructuracion_pct >= 0 and comision_estructuracion_pct <= 100),
  comision_no_disposicion_pct numeric check (comision_no_disposicion_pct >= 0 and comision_no_disposicion_pct <= 100),
  estado                      text check (estado in ('aprobado', 'en_revision', 'pendiente')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint project_loans_orden_unico unique (project_id, orden)
);

comment on table public.project_loans is 'Créditos de la deuda senior (financiamiento con varios bancos, v1). Mismo plazo y perfil esculpido para todos; cada uno recibe y amortiza su % de participación.';
comment on column public.project_loans.comision_no_disposicion_pct is 'Opcional: % anual sobre lo comprometido no dispuesto, del NTP a la COD. Vacío = no se cobra.';

-- Mismo patrón de equipo que las demás tablas del proyecto: ver con puede_ver(), escribir con puede_editar()
alter table public.project_loans enable row level security;
create policy project_loans_select_equipo on public.project_loans for select to authenticated using (public.puede_ver(project_id));
create policy project_loans_insert_equipo on public.project_loans for insert to authenticated with check (public.puede_editar(project_id));
create policy project_loans_update_equipo on public.project_loans for update to authenticated using (public.puede_editar(project_id)) with check (public.puede_editar(project_id));
create policy project_loans_delete_equipo on public.project_loans for delete to authenticated using (public.puede_editar(project_id));

-- Proyectos existentes: un crédito al 100 % con su tasa y comisión actuales (antes de crear el trigger del historial,
-- para no registrar como cambio del usuario lo que es una migración). Solo los que tienen ambas capturadas.
insert into public.project_loans (project_id, orden, banco, participacion_pct, tasa_anual_pct, comision_estructuracion_pct, comision_no_disposicion_pct, estado)
select a.project_id, 1, null, 100, a.tasa_interes_pct, a.comision_estructuracion_pct, null, 'aprobado'
from public.project_financial_assumptions a
where a.tasa_interes_pct is not null
  and a.comision_estructuracion_pct is not null
  and not exists (select 1 from public.project_loans l where l.project_id = a.project_id);

-- Columnas de los supuestos que ya no se usan (no se borran)
comment on column public.project_financial_assumptions.tasa_interes_pct is 'En desuso desde 20261023: ver project_loans';
comment on column public.project_financial_assumptions.comision_estructuracion_pct is 'En desuso desde 20261023: ver project_loans';

-- Historial: altas, bajas y cambios de los créditos en project_change_log, con el campo 'supuesto' (ya permitido)
create or replace function public.registrar_cambio_credito()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila     public.project_loans := coalesce(new, old);
  v_nombre   text := 'Crédito · ' || coalesce(v_fila.banco, 'banco sin capturar');
  v_antes    jsonb;
  v_despues  jsonb;
  v_clave    text;
begin
  if tg_op = 'INSERT' then
    insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
    values (new.project_id, v_nombre, 'supuesto', null, 'credito=alta', 'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
    values (old.project_id, v_nombre, 'supuesto', 'credito=alta', 'credito=baja', 'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
    return old;
  end if;
  v_antes := to_jsonb(old);
  v_despues := to_jsonb(new);
  for v_clave in select jsonb_object_keys(v_despues) loop
    if v_clave in ('id', 'project_id', 'created_at', 'updated_at') then
      continue;
    end if;
    if (v_antes -> v_clave) is distinct from (v_despues -> v_clave) then
      insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
      values (new.project_id, v_nombre, 'supuesto',
              v_clave || '=' || coalesce(v_antes ->> v_clave, ''), v_clave || '=' || coalesce(v_despues ->> v_clave, ''),
              'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.registrar_cambio_credito() from public, anon, authenticated;

drop trigger if exists project_loans_historial on public.project_loans;
create trigger project_loans_historial
  after insert or update or delete on public.project_loans
  for each row execute function public.registrar_cambio_credito();

-- Reversión:
--   drop trigger if exists project_loans_historial on public.project_loans;
--   drop function if exists public.registrar_cambio_credito();
--   comment on column public.project_financial_assumptions.tasa_interes_pct is null;
--   comment on column public.project_financial_assumptions.comision_estructuracion_pct is null;
--   drop table if exists public.project_loans;
