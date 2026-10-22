<#
Genera restaurar.sql a partir de un respaldo de npm run respaldo (scripts\respaldo.mjs). NO lo ejecuta: revísalo y ejecútalo tú.

Restaura las filas que falten (on conflict do nothing): no sobrescribe datos que ya existen.
- Mismo proyecto de Supabase (p. ej. después de borrar datos por error): basta con ejecutar el SQL.
- Proyecto nuevo: primero aplicar las migraciones (npx supabase db push) y volver a invitar a los usuarios
  con el mismo correo; los id de usuario cambian, así que owner_id y user_id deben actualizarse antes.

Uso:      powershell -ExecutionPolicy Bypass -File scripts\restaurar_respaldo.ps1 respaldos\AAAA-MM-DD_HHmm
Ejecutar: npx supabase db query --linked -f respaldos\AAAA-MM-DD_HHmm\restaurar.sql
#>
param([Parameter(Mandatory = $true)][string]$Respaldo)
$ErrorActionPreference = 'Stop'

# Orden de carga: primero las tablas de las que dependen las demás
$tablas = @(
  'solar_projects', 'project_deliverables', 'project_guarantees', 'project_guarantee_renewals',
  'project_cash_movements', 'project_financial_assumptions', 'project_change_log', 'assistant_messages'
)
$utf8 = New-Object System.Text.UTF8Encoding $false
$sql = New-Object System.Text.StringBuilder
[void]$sql.AppendLine("-- Restauración generada el $((Get-Date).ToString('s')) desde $Respaldo")
[void]$sql.AppendLine('begin;')
foreach ($t in $tablas) {
  $archivo = Join-Path $Respaldo "$t.json"
  if (-not (Test-Path $archivo)) { throw "Falta $archivo" }
  $json = [System.IO.File]::ReadAllText($archivo, $utf8)
  if ($json.Contains('$respaldo$')) { throw "El respaldo de $t contiene el delimitador `$respaldo`$" }
  [void]$sql.AppendLine("insert into public.$t select * from json_populate_recordset(null::public.$t, `$respaldo`$$json`$respaldo`$) on conflict do nothing;")
}
[void]$sql.AppendLine('commit;')
$salida = Join-Path $Respaldo 'restaurar.sql'
[System.IO.File]::WriteAllText($salida, $sql.ToString(), $utf8)
Write-Host "Generado $salida. Revísalo antes de ejecutarlo."
