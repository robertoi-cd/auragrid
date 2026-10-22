-- Asistente por rol: cupo diario por lector, reserva para el dueño y configuración en un solo lugar.
-- * configuracion_asistente (una sola fila): cupo global diario de consultas a Gemini, reserva del dueño, límite por
--   lector por defecto y zona horaria del día (el contador se reinicia a medianoche de esa zona).
-- * project_members.limite_asistente_diario: límite de cada lector (vacío = el de configuracion_asistente).
-- * asistente_uso: una fila por consulta. La reserva la hace gemini-proxy ANTES de llamar a Gemini (y la libera si
--   Gemini falla), con reservar_consulta_asistente(): así el límite no depende del navegador.
-- * Reglas: el dueño y los editores usan el cupo global completo; cada lector, como máximo su límite diario y solo
--   mientras el uso global del día deje intactas las consultas reservadas al dueño.
-- * El chat de cada persona ya es privado (assistant_messages: cada usuario ve y borra solo sus mensajes).

-- 1. Configuración (un solo lugar) -------------------------------------------------------
create table if not exists public.configuracion_asistente (
  id                    boolean primary key default true check (id),
  -- Consultas diarias que admite la clave de Gemini: 20 en el nivel gratuito (dato del usuario, 13 oct 2026).
  -- Con el nivel de pago se sube aquí (y conviene subir el límite por lector, p. ej. a 25-30).
  cupo_global_diario    integer not null default 20 check (cupo_global_diario > 0),
  reserva_dueno_diaria  integer not null default 10 check (reserva_dueno_diaria >= 0),
  limite_lector_defecto integer not null default 5 check (limite_lector_defecto between 0 and 1000),
  zona_horaria          text not null default 'America/Mexico_City',
  actualizado           timestamptz not null default now(),
  check (reserva_dueno_diaria < cupo_global_diario)
);
insert into public.configuracion_asistente (id) values (true) on conflict (id) do nothing;
alter table public.configuracion_asistente enable row level security;
create policy "configuracion_asistente_select" on public.configuracion_asistente for select to authenticated using (true);
-- Se cambia solo desde Supabase (SQL o panel), no desde la app
revoke insert, update, delete on public.configuracion_asistente from anon, authenticated;

-- 2. Límite por lector -------------------------------------------------------------------
alter table public.project_members add column if not exists limite_asistente_diario integer
  check (limite_asistente_diario between 0 and 1000);

-- 3. Uso del asistente -------------------------------------------------------------------
create table if not exists public.asistente_uso (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  project_id text references public.solar_projects (id) on delete set null,
  clase      text not null check (clase in ('dueno', 'editor', 'lector')),
  dia        date not null,
  creado     timestamptz not null default now()
);
create index if not exists asistente_uso_dia_idx on public.asistente_uso (dia, clase);
create index if not exists asistente_uso_usuario_idx on public.asistente_uso (user_id, project_id, dia);
alter table public.asistente_uso enable row level security;
-- Cada quien ve solo su propio uso (para el contador); lo escriben solo las funciones de abajo
create policy "asistente_uso_select_propio" on public.asistente_uso for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.asistente_uso from anon, authenticated;

create or replace function public.dia_asistente()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select (now() at time zone (select zona_horaria from public.configuracion_asistente where id))::date; $$;

-- Cupo del usuario actual para un proyecto (para el contador del chat y para reservar).
-- Sin proyecto: cuenta como dueño solo si es dueño de algún proyecto.
create or replace function public.cupo_asistente(p_project_id text)
returns table (rol text, limite integer, usadas integer, restantes integer, motivo text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.configuracion_asistente;
  v_rol text;
  v_dia date := public.dia_asistente();
  v_global integer;
  v_propias integer;
  v_limite integer;
begin
  select * into c from public.configuracion_asistente where id;
  v_rol := case
    when p_project_id is null then (case when exists (select 1 from public.solar_projects where owner_id = auth.uid()) then 'dueno' end)
    else public.rol_en_proyecto(p_project_id) end;
  select count(*) into v_global from public.asistente_uso where dia = v_dia;
  if v_rol is null then
    return query select null::text, 0, 0, 0, 'sin_acceso'::text;
  elsif v_rol in ('dueno', 'editor') then
    return query select v_rol, c.cupo_global_diario, v_global, greatest(c.cupo_global_diario - v_global, 0),
      case when v_global >= c.cupo_global_diario then 'cupo_global' end;
  else
    select coalesce(m.limite_asistente_diario, c.limite_lector_defecto) into v_limite
      from public.project_members m where m.project_id = p_project_id and m.user_id = auth.uid();
    select count(*) into v_propias from public.asistente_uso where dia = v_dia and user_id = auth.uid() and project_id = p_project_id;
    return query select v_rol, v_limite, v_propias,
      greatest(least(v_limite - v_propias, c.cupo_global_diario - c.reserva_dueno_diaria - v_global), 0),
      case when v_propias >= v_limite then 'limite_lector'
           when v_global >= c.cupo_global_diario - c.reserva_dueno_diaria then 'reserva_dueno' end;
  end if;
end;
$$;

-- Reserva una consulta antes de llamar a Gemini (la usa gemini-proxy con la sesión del usuario). Se serializa con un
-- bloqueo de la fila de configuración para que dos consultas simultáneas no pasen ambas el último cupo.
create or replace function public.reservar_consulta_asistente(p_project_id text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.configuracion_asistente;
  r record;
  v_id uuid;
begin
  select * into v from public.configuracion_asistente where id for update;
  select * into r from public.cupo_asistente(p_project_id);
  if r.restantes <= 0 then
    return json_build_object('permitido', false, 'rol', r.rol, 'limite', r.limite, 'restantes', 0, 'motivo', r.motivo);
  end if;
  insert into public.asistente_uso (user_id, project_id, clase, dia)
  values (auth.uid(), p_project_id, r.rol, public.dia_asistente()) returning id into v_id;
  return json_build_object('permitido', true, 'rol', r.rol, 'limite', r.limite, 'restantes', r.restantes - 1, 'uso_id', v_id);
end;
$$;

-- Devuelve la consulta si Gemini falló (solo la propia y en los 5 minutos siguientes)
create or replace function public.liberar_consulta_asistente(p_uso_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$ delete from public.asistente_uso where id = p_uso_id and user_id = auth.uid() and creado > now() - interval '5 minutes'; $$;

revoke execute on function public.dia_asistente(), public.cupo_asistente(text), public.reservar_consulta_asistente(text), public.liberar_consulta_asistente(uuid) from public, anon;
grant execute on function public.dia_asistente(), public.cupo_asistente(text), public.reservar_consulta_asistente(text), public.liberar_consulta_asistente(uuid) to authenticated;

-- 4. Equipo: límite al dar acceso y editable después ------------------------------------------
alter table public.project_change_log drop constraint if exists project_change_log_campo_check;
alter table public.project_change_log
  add constraint project_change_log_campo_check check (campo in (
    'estado', 'fecha', 'responsable', 'titulo', 'alta', 'baja',
    'baja_garantia', 'garantia_concepto', 'garantia_tipo', 'garantia_beneficiario', 'garantia_categoria',
    'proyecto_nombre', 'proyecto_capacidad', 'proyecto_estado', 'proyecto_capex', 'proyecto_rtb', 'proyecto_margen',
    'proyecto_archivo', 'supuesto',
    'miembro_alta', 'miembro_rol', 'miembro_baja', 'miembro_limite', 'evidencia_alta', 'evidencia_baja'));

drop function if exists public.agregar_miembro(text, text, text);
create or replace function public.agregar_miembro(p_project_id text, p_correo text, p_rol text, p_limite integer default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid;
  v_anterior text;
  v_correo text := lower(btrim(coalesce(p_correo, '')));
begin
  if not public.es_dueno(p_project_id) then
    raise exception 'Solo el dueño del proyecto puede administrar el equipo.' using errcode = '42501', hint = 'solo_dueno';
  end if;
  if p_rol not in ('editor', 'lector') then
    raise exception 'El rol debe ser editor o lector.' using errcode = '22023', hint = 'rol_invalido';
  end if;
  if p_limite is not null and (p_limite < 0 or p_limite > 1000) then
    raise exception 'El límite diario debe estar entre 0 y 1,000 consultas.' using errcode = '22023', hint = 'limite_invalido';
  end if;
  select id into v_usuario from auth.users where lower(email) = v_correo;
  if v_usuario is null then
    raise exception 'No hay una cuenta de AuraGrid con ese correo. Invítala primero desde Supabase.' using errcode = 'P0002', hint = 'sin_cuenta';
  end if;
  if v_usuario = auth.uid() then
    raise exception 'Ya eres el dueño del proyecto.' using errcode = '22023', hint = 'es_dueno';
  end if;
  select rol into v_anterior from public.project_members where project_id = p_project_id and user_id = v_usuario;
  insert into public.project_members (project_id, user_id, rol, agregado_por, limite_asistente_diario)
  values (p_project_id, v_usuario, p_rol, auth.uid(), p_limite)
  on conflict (project_id, user_id) do update set rol = excluded.rol, limite_asistente_diario = excluded.limite_asistente_diario;
  if v_anterior is null or v_anterior <> p_rol then
    insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
    values (p_project_id, 'Equipo: ' || v_correo, case when v_anterior is null then 'miembro_alta' else 'miembro_rol' end,
            v_anterior, p_rol || coalesce(' (' || p_limite || ' consultas/día)', ''), 'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
  end if;
end;
$$;

create or replace function public.cambiar_limite_asistente(p_project_id text, p_user_id uuid, p_limite integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_anterior integer;
  v_correo text;
begin
  if not public.es_dueno(p_project_id) then
    raise exception 'Solo el dueño del proyecto puede administrar el equipo.' using errcode = '42501', hint = 'solo_dueno';
  end if;
  if p_limite is not null and (p_limite < 0 or p_limite > 1000) then
    raise exception 'El límite diario debe estar entre 0 y 1,000 consultas.' using errcode = '22023', hint = 'limite_invalido';
  end if;
  select limite_asistente_diario into v_anterior from public.project_members where project_id = p_project_id and user_id = p_user_id;
  if not found then
    raise exception 'Esa persona no es miembro del proyecto.' using errcode = 'P0002', hint = 'no_miembro';
  end if;
  update public.project_members set limite_asistente_diario = p_limite where project_id = p_project_id and user_id = p_user_id;
  select email into v_correo from auth.users where id = p_user_id;
  insert into public.project_change_log (project_id, entregable, campo, valor_anterior, valor_nuevo, tipo, user_id, user_email)
  values (p_project_id, 'Equipo: ' || coalesce(v_correo, p_user_id::text), 'miembro_limite',
          coalesce(v_anterior::text, 'predeterminado'), coalesce(p_limite::text, 'predeterminado'), 'cambio', auth.uid(), nullif(auth.jwt() ->> 'email', ''));
end;
$$;

-- Miembros con su correo, su límite (el efectivo) y lo que llevan hoy
drop function if exists public.miembros_proyecto(text);
create or replace function public.miembros_proyecto(p_project_id text)
returns table (user_id uuid, correo text, rol text, desde timestamptz, limite_asistente integer, limite_propio boolean, usadas_hoy integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sp.owner_id, u.email::text, 'dueno', sp.created_at, null::integer, false, null::integer
    from public.solar_projects sp join auth.users u on u.id = sp.owner_id
   where sp.id = p_project_id and public.puede_ver(p_project_id)
  union all
  select m.user_id, u.email::text, m.rol, m.created_at,
         case when m.rol = 'lector' then coalesce(m.limite_asistente_diario, (select limite_lector_defecto from public.configuracion_asistente where id)) end,
         m.limite_asistente_diario is not null,
         case when m.rol = 'lector' and public.es_dueno(p_project_id) then
           (select count(*)::integer from public.asistente_uso a where a.user_id = m.user_id and a.project_id = p_project_id and a.dia = public.dia_asistente()) end
    from public.project_members m join auth.users u on u.id = m.user_id
   where m.project_id = p_project_id and public.puede_ver(p_project_id)
  order by 4;
$$;

revoke execute on function public.agregar_miembro(text, text, text, integer), public.cambiar_limite_asistente(text, uuid, integer), public.miembros_proyecto(text) from public, anon;
grant execute on function public.agregar_miembro(text, text, text, integer), public.cambiar_limite_asistente(text, uuid, integer), public.miembros_proyecto(text) to authenticated;

-- Reversión: drop functions reservar_consulta_asistente, liberar_consulta_asistente, cupo_asistente, dia_asistente,
-- cambiar_limite_asistente; volver a agregar_miembro(text, text, text) y miembros_proyecto de 20261014100000;
-- drop table asistente_uso, configuracion_asistente; alter table project_members drop column limite_asistente_diario;
-- restricción de campo: la de 20261014100000.
