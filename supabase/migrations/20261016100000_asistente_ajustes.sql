-- Ajustes al cupo del asistente (13 oct 2026):
-- 1. La reserva diaria es solo del dueño: los editores usan el cupo global sin tocarla y, opcionalmente, con un límite
--    propio (project_members.limite_asistente_diario; vacío = sin límite propio). Los lectores, igual que antes.
-- 2. El día del contador se alinea con la cuota de Google: "Requests per day (RPD) quotas reset at midnight Pacific
--    time" (https://ai.google.dev/gemini-api/docs/rate-limits, consultado el 13 oct 2026). La zona sigue siendo
--    configurable en configuracion_asistente.zona_horaria. cupo_asistente devuelve además la hora del próximo reinicio.
-- 3. El dueño ve en Equipo cuántas consultas lleva hoy cada persona (miembros_proyecto.usadas_hoy), nunca su chat:
--    assistant_messages sigue siendo privado (cada quien ve solo sus mensajes; esta migración no lo cambia).

-- 1. Zona horaria de Google (medianoche del Pacífico = 1:00, o 2:00 en invierno, hora del centro de México)
alter table public.configuracion_asistente alter column zona_horaria set default 'America/Los_Angeles';
update public.configuracion_asistente set zona_horaria = 'America/Los_Angeles', actualizado = now()
 where id and zona_horaria = 'America/Mexico_City';

-- Próximo reinicio del contador (medianoche de la zona configurada)
create or replace function public.reinicio_asistente()
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select ((public.dia_asistente() + 1)::timestamp at time zone (select zona_horaria from public.configuracion_asistente where id)); $$;

-- 2. Cupo por rol. Motivos: limite_lector, limite_editor (límite propio), reserva_dueno, cupo_global, sin_acceso.
drop function if exists public.cupo_asistente(text);
create function public.cupo_asistente(p_project_id text)
returns table (rol text, limite integer, usadas integer, restantes integer, motivo text, reinicia timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.configuracion_asistente;
  v_rol text;
  v_dia date := public.dia_asistente();
  v_reinicia timestamptz := public.reinicio_asistente();
  v_global integer;
  v_equipo integer;   -- lo que el equipo (editores y lectores) aún puede usar sin tocar la reserva del dueño
  v_propias integer;
  v_limite integer;
begin
  select * into c from public.configuracion_asistente where id;
  v_rol := case
    when p_project_id is null then (case when exists (select 1 from public.solar_projects where owner_id = auth.uid()) then 'dueno' end)
    else public.rol_en_proyecto(p_project_id) end;
  select count(*) into v_global from public.asistente_uso where dia = v_dia;
  v_equipo := c.cupo_global_diario - c.reserva_dueno_diaria - v_global;

  if v_rol is null then
    return query select null::text, 0, 0, 0, 'sin_acceso'::text, v_reinicia;
  elsif v_rol = 'dueno' then
    return query select v_rol, c.cupo_global_diario, v_global, greatest(c.cupo_global_diario - v_global, 0),
      case when v_global >= c.cupo_global_diario then 'cupo_global' end, v_reinicia;
  else
    select case when v_rol = 'lector' then coalesce(m.limite_asistente_diario, c.limite_lector_defecto) else m.limite_asistente_diario end
      into v_limite
      from public.project_members m where m.project_id = p_project_id and m.user_id = auth.uid();
    select count(*) into v_propias from public.asistente_uso where dia = v_dia and user_id = auth.uid() and project_id = p_project_id;
    if v_limite is null then
      -- Editor sin límite propio: el cupo del equipo
      return query select v_rol, c.cupo_global_diario - c.reserva_dueno_diaria, v_propias, greatest(v_equipo, 0),
        case when v_global >= c.cupo_global_diario then 'cupo_global' when v_equipo <= 0 then 'reserva_dueno' end, v_reinicia;
    else
      return query select v_rol, v_limite, v_propias, greatest(least(v_limite - v_propias, v_equipo), 0),
        case when v_propias >= v_limite then 'limite_' || v_rol
             when v_global >= c.cupo_global_diario then 'cupo_global'
             when v_equipo <= 0 then 'reserva_dueno' end, v_reinicia;
    end if;
  end if;
end;
$$;

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
    return json_build_object('permitido', false, 'rol', r.rol, 'limite', r.limite, 'restantes', 0, 'motivo', r.motivo, 'reinicia', r.reinicia);
  end if;
  insert into public.asistente_uso (user_id, project_id, clase, dia)
  values (auth.uid(), p_project_id, r.rol, public.dia_asistente()) returning id into v_id;
  return json_build_object('permitido', true, 'rol', r.rol, 'limite', r.limite, 'restantes', r.restantes - 1, 'uso_id', v_id, 'reinicia', r.reinicia);
end;
$$;

-- 3. Equipo: límite de lectores y editores, y consultas de hoy de cada persona (solo las ve el dueño; nunca el chat)
drop function if exists public.miembros_proyecto(text);
create function public.miembros_proyecto(p_project_id text)
returns table (user_id uuid, correo text, rol text, desde timestamptz, limite_asistente integer, limite_propio boolean, usadas_hoy integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with usos as (
    select a.user_id, count(*)::integer as n from public.asistente_uso a
     where a.project_id = p_project_id and a.dia = public.dia_asistente() and public.es_dueno(p_project_id)
     group by a.user_id
  )
  select sp.owner_id, u.email::text, 'dueno', sp.created_at, null::integer, false,
         case when public.es_dueno(p_project_id) then coalesce((select n from usos where usos.user_id = sp.owner_id), 0) end
    from public.solar_projects sp join auth.users u on u.id = sp.owner_id
   where sp.id = p_project_id and public.puede_ver(p_project_id)
  union all
  select m.user_id, u.email::text, m.rol, m.created_at,
         case when m.rol = 'lector' then coalesce(m.limite_asistente_diario, (select limite_lector_defecto from public.configuracion_asistente where id))
              else m.limite_asistente_diario end,
         m.limite_asistente_diario is not null,
         case when public.es_dueno(p_project_id) then coalesce((select n from usos where usos.user_id = m.user_id), 0) end
    from public.project_members m join auth.users u on u.id = m.user_id
   where m.project_id = p_project_id and public.puede_ver(p_project_id)
  order by 4;
$$;

revoke execute on function public.reinicio_asistente(), public.cupo_asistente(text), public.reservar_consulta_asistente(text), public.miembros_proyecto(text) from public, anon;
grant execute on function public.reinicio_asistente(), public.cupo_asistente(text), public.reservar_consulta_asistente(text), public.miembros_proyecto(text) to authenticated;

-- Reversión: volver a cupo_asistente, reservar_consulta_asistente y miembros_proyecto de 20261015100000;
-- drop function reinicio_asistente(); update configuracion_asistente set zona_horaria = 'America/Mexico_City';
-- alter column zona_horaria set default 'America/Mexico_City'.
