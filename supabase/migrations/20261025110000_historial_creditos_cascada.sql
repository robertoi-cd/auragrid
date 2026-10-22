-- Corrección: el dueño no podía borrar un proyecto con créditos. Al borrar el proyecto, la cascada borra sus créditos y
-- el trigger del historial de créditos intentaba registrar la baja en project_change_log con un proyecto que ya no
-- existe (violación de la llave foránea; el borrado completo fallaba). Encontrado en las pruebas de permisos del 19 oct
-- 2026. Misma guarda que los triggers de baja de entregables, garantías y evidencias: si el proyecto ya no existe
-- (borrado en cascada), no se registra nada. No cambia tablas ni datos; solo reemplaza la función del trigger.

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
    -- Si se borra el proyecto completo (cascada) no se registra: el historial del proyecto también se borra
    if not exists (select 1 from public.solar_projects where id = old.project_id) then
      return old;
    end if;
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

-- Reversión: volver a la versión de 20261023100000_creditos_deuda.sql (sin la guarda).
