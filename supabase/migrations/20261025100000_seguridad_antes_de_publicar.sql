-- Seguridad antes de publicar (auditoría del 19 oct 2026, hallazgos 1 a 4). No cambia tablas, columnas ni datos:
-- solo quita una política y permisos que no usa la app.
--
-- 1. solar_projects: la política "Permitir acceso total a usuarios autenticados" (creada a mano en el panel, PERMISSIVE,
--    para todas las operaciones) se sumaba con OR a las del equipo y dejaba a cualquier usuario con sesión ver,
--    modificar y borrar cualquier proyecto. Quedan las 4 políticas del equipo: leer = puede_ver, insertar = dueño,
--    modificar = puede_editar, borrar = dueño.
-- 2. Vistas del prototipo (vw_*): se ejecutan con los permisos de su dueño (saltan el RLS) y anon podía leerlas.
-- 3. Funciones SECURITY DEFINER del prototipo, sin search_path fijo y ejecutables sin sesión. La app no las usa.
-- 4. spatial_ref_sys (PostGIS): sin RLS y con permisos de escritura para anon y authenticated. Es de supabase_admin:
--    si el rol de las migraciones no puede quitarlos, se avisa (NOTICE) y queda como pendiente conocido.

drop policy if exists "Permitir acceso total a usuarios autenticados" on public.solar_projects;

revoke select on public.vw_pending_client_alerts, public.vw_project_commercial_financial_profile, public.vw_regulatory_audit_summary
  from anon, authenticated;

revoke execute on function public.calculate_project_financials(uuid), public.evaluate_construction_cash_flows(uuid),
  public.evaluate_equity_cash_flow_gap(uuid), public.fn_get_project_financial_rules(uuid)
  from public, anon, authenticated;

do $$
begin
  execute 'revoke insert, update, delete, truncate on public.spatial_ref_sys from anon, authenticated';
exception when insufficient_privilege then
  raise notice 'spatial_ref_sys: sin permiso para quitar la escritura (es de supabase_admin); queda como pendiente.';
end $$;

-- Reversión (solo si hiciera falta; la política 1 abre todos los proyectos a cualquier usuario con sesión):
--   create policy "Permitir acceso total a usuarios autenticados" on public.solar_projects for all to public
--     using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
--   grant select on public.vw_pending_client_alerts, public.vw_project_commercial_financial_profile, public.vw_regulatory_audit_summary to anon, authenticated;
--   grant execute on function public.calculate_project_financials(uuid), public.evaluate_construction_cash_flows(uuid),
--     public.evaluate_equity_cash_flow_gap(uuid), public.fn_get_project_financial_rules(uuid) to public, anon, authenticated;
--   grant insert, update, delete, truncate on public.spatial_ref_sys to anon, authenticated;
