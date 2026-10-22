-- Corrección de dos entregables de Alpha I que cambiaron sin intención el 12 oct 2026 a las 07:12 UTC
-- (el clic sobre el estado lo avanzaba y se guardaba sin confirmación):
--   * Levantamiento topográfico y deslinde: completo → en curso (07:12:47 UTC). Se restaura a completo.
--   * Resolutivo de MIA: en curso → bloqueado (07:12:54 UTC). Ya se restauró a en curso desde la app
--     a las 07:40:00 UTC, antes de que existiera el historial.
--
-- En el historial quedan:
--   1. Los movimientos anteriores al historial, reconstruidos con su hora real (updated_at de la fila) y
--      marcados así en el motivo.
--   2. La corrección del levantamiento topográfico, registrada por el trigger como "corrección".
-- Todo se atribuye al dueño del proyecto: los cambios se hicieron con su sesión (RLS) y él pidió la corrección.
-- Solo cambia la fila si sigue en el estado erróneo; los registros reconstruidos no se duplican.

do $$
declare
  v_owner uuid;
  v_email text;
  v_topo  uuid;
  v_mia   uuid;
  v_reconstruido constant text := 'Registro reconstruido: cambio hecho antes de que existiera el historial.';
begin
  select sp.owner_id, u.email into v_owner, v_email
    from public.solar_projects sp
    left join auth.users u on u.id = sp.owner_id
   where sp.id = 'alpha-i-50mw';
  select id into v_topo from public.project_deliverables where project_id = 'alpha-i-50mw' and titulo = 'Levantamiento topográfico y deslinde';
  select id into v_mia  from public.project_deliverables where project_id = 'alpha-i-50mw' and titulo = 'Resolutivo de MIA';

  -- 1. Movimientos anteriores al historial (con la hora real en que ocurrieron)
  if not exists (select 1 from public.project_change_log where project_id = 'alpha-i-50mw' and motivo like 'Registro reconstruido%') then
    insert into public.project_change_log (project_id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_id, user_email, created_at)
    values
      ('alpha-i-50mw', v_topo, 'Levantamiento topográfico y deslinde', 'estado', 'completo', 'curso',
        v_reconstruido || ' Sin intención: el clic avanzaba el estado.', 'cambio', v_owner, v_email, timestamptz '2026-10-12 07:12:47.36+00'),
      ('alpha-i-50mw', v_mia, 'Resolutivo de MIA', 'estado', 'curso', 'bloqueado',
        v_reconstruido || ' Sin intención: el clic avanzaba el estado.', 'cambio', v_owner, v_email, timestamptz '2026-10-12 07:12:54.584+00'),
      ('alpha-i-50mw', v_mia, 'Resolutivo de MIA', 'estado', 'bloqueado', 'curso',
        v_reconstruido || ' Restaurado desde la app.', 'correccion', v_owner, v_email, timestamptz '2026-10-12 07:40:00.733+00');
  end if;

  -- 2. Corrección del levantamiento topográfico (el trigger la registra como "corrección")
  perform set_config('auragrid.tipo', 'correccion', true);
  perform set_config('auragrid.usuario_id', coalesce(v_owner::text, ''), true);
  perform set_config('auragrid.usuario_email', coalesce(v_email, ''), true);
  perform set_config('auragrid.motivo',
    'Corrección: el estado cambió sin intención el 12 oct 2026 (el clic avanzaba el estado sin confirmación); se restaura el estado original.', true);

  update public.project_deliverables set estado = 'completo', updated_at = now()
   where id = v_topo and estado = 'curso';
  -- Por si la MIA volviera a quedar bloqueada antes de aplicar esta migración
  update public.project_deliverables set estado = 'curso', updated_at = now()
   where id = v_mia and estado = 'bloqueado';
end;
$$;

-- Reversión: no se recomienda (el historial es de solo agregar). Si hiciera falta, cambiar los estados
-- desde la app con su motivo; los registros quedan en el historial.
