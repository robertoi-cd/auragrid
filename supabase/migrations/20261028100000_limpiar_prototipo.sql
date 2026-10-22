-- Limpieza de los objetos heredados del prototipo que la app no usa: 37 tablas, 3 vistas, 8 funciones y 1 tarea de
-- pg_cron. La app solo usa 16 tablas (solar_projects, project_deliverables, project_guarantees,
-- project_guarantee_renewals, project_cash_movements, project_financial_assumptions, project_change_log,
-- assistant_messages, project_members, project_loans, deliverable_evidence, guarantee_evidence, project_access_log,
-- project_export_log, asistente_uso, configuracion_asistente). Ninguna de ellas tiene llaves foráneas hacia las tablas
-- que se borran, ni políticas, vistas o funciones que dependan de estas.
-- Se borran datos de prueba del prototipo (24 de las 37 tablas tenían filas; 13 estaban vacías). Hacer antes un respaldo:
--   npm run respaldo -- --con-archivos
-- Sin CASCADE: si algo que no está en esta lista dependiera de lo que se borra, la migración falla y no se borra nada.
-- Orden: tarea programada, vistas, tablas (con sus triggers y políticas) y, al final, las funciones que quedan huérfanas.

-- 1. Tarea de pg_cron del prototipo: refresca una vista materializada (mv_historical_regulatory_audit) que ya no existe
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-regulatory-audit-view') then
    perform cron.unschedule('refresh-regulatory-audit-view');
  end if;
end $$;

-- 2. Vistas del prototipo (ya sin acceso para anon y authenticated desde 20261025100000)
drop view if exists public.vw_pending_client_alerts, public.vw_project_commercial_financial_profile, public.vw_regulatory_audit_summary;

-- 3. Tablas del prototipo (37). Una sola sentencia: se resuelven entre sí las llaves foráneas que haya entre ellas
drop table
  public.ai_expert_advisor_logs, public.commercial_contract_types, public.commercial_strategies, public.construction_cash_flows,
  public.data_room_access_logs, public.data_room_documents, public.data_room_modules, public.data_rooms,
  public.debt_drawdown_schedules, public.energy_cost_calculations, public.energy_tariffs, public.financial_cash_flows,
  public.financial_optimization_tips, public.grid_nodes, public.industrial_plants, public.market_fx_forwards,
  public.market_macro_indicators, public.market_spot_fx, public.node_telemetry, public.node_telemetry_history,
  public.organizations, public.project_audit_logs, public.project_capex_breakdown, public.project_financial_baselines,
  public.project_financial_configs, public.project_financial_inputs, public.project_financial_outputs,
  public.project_opex_breakdown, public.project_reports, public.project_rtb_tracker, public.project_study_milestones,
  public.projects, public.regulatory_reports, public.regulatory_versions, public.slp_auction_editions,
  public.system_evolution_logs, public.user_plants;

-- 4. Funciones del prototipo: las 4 que se dejaron sin acceso en 20261025100000 y 4 de triggers y limpieza que quedaron huérfanas
drop function if exists
  public.calculate_project_financials(uuid), public.evaluate_construction_cash_flows(uuid),
  public.evaluate_equity_cash_flow_gap(uuid), public.fn_get_project_financial_rules(uuid),
  public.fn_cleanup_historical_telemetry(), public.fn_enforce_report_immutability(),
  public.fn_evaluate_grid_node_telemetry(), public.fn_log_report_evolution();

-- Reversión: no hay. Los datos solo se recuperan del respaldo (respaldos/AAAA-MM-DD_HHmm/<tabla>.json) y las tablas,
-- de las migraciones o del esquema guardado en el respaldo previo. Por eso el respaldo va antes.
