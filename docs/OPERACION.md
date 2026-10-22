# Operación de AuraGrid

Guía para quien administra la app: claves, base de datos, equipo y cupos, publicación, respaldos y despliegue del asistente. La descripción del proyecto está en el [README](../README.es.md).

## Arquitectura

| Parte | Tecnología | Dónde |
|---|---|---|
| Interfaz | React 19 + Vite | `src/` (componentes `.jsx`) |
| Cálculos y reglas | TypeScript, sin dependencias de React | `src/lib/*.ts` |
| Datos y autenticación | Supabase (Postgres con RLS por dueño del proyecto) | `supabase/migrations/` |
| Asistente | Edge Function `gemini-proxy` (Deno) | `supabase/functions/gemini-proxy/`, reglas en `supabase/functions/_shared/asesor.ts` |
| Pruebas | `node:test` ejecutado con tsx | `tests/` |

## Instalación

Requisitos: Node.js 20.19 o superior (probado con 24) y npm. Para desplegar, la CLI de Supabase (se usa con `npx`).

```bash
npm install
npm run dev        # http://localhost:5173
```

## Variables y claves

| Dato | Dónde vive | ¿Es secreto? |
|---|---|---|
| URL del proyecto de Supabase | `src/supabase.js` | No |
| Clave publicable `sb_publishable_…` | `src/supabase.js` | No: es pública por diseño. Protegen los datos las políticas RLS |
| `GEMINI_API_KEY` | Secreto de la Edge Function | **Sí.** Nunca en el frontend ni en git |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (opcionales) | Secretos de la Edge Function | **Sí.** Sirven para avisar a Telegram, como máximo una vez al día, si el asistente falla |

Los secretos se configuran así:

```bash
npx supabase secrets set GEMINI_API_KEY=... --project-ref vpsikmgnhubkydftahdl
```

`.gitignore` excluye `.env` y `.env.*`. No guardes claves en archivos versionados.

## Base de datos

Las migraciones están en `supabase/migrations/` y se aplican en orden:

```bash
npx supabase link --project-ref vpsikmgnhubkydftahdl
npx supabase db push --linked
```

- **Acceso por rol:** cada tabla del proyecto tiene RLS por rol: dueño (`solar_projects.owner_id`), editor o lector (`project_members`). Solo el dueño archiva, restaura y administra el equipo.
- **Documentos:** bucket privado `aura-documentos` (`<project_id>/<deliverable_id>/<archivo>`), descargas con enlace firmado de 10 minutos.
- **Cupo del asistente:** `configuracion_asistente` (una sola fila) guarda el cupo global diario, la reserva del dueño y el límite predeterminado por lector. El límite de cada lector está en `project_members.limite_asistente_diario`.
- **Historial:** `project_change_log` es de solo lectura para los usuarios. Lo escriben triggers.
- **Cambios de entregables:** pasan por las funciones `actualizar_entregable`, `agregar_entregable` y `eliminar_entregable`.

## Equipo, lectores y asistente

En el menú ⋯ del proyecto, **Equipo y accesos…** (solo el dueño):

- **Agregar a alguien:** primero se crea su cuenta en Supabase (Authentication → Users → Add user) o, con la app publicada, se le invita (Invite user); después se agrega en la app con su correo, rol y límite diario de consultas. El botón "Invitar" dentro de la app está en el ROADMAP (requiere SMTP).
- **Editor:** ve y edita todo, excepto archivar y administrar el equipo. Usa el cupo del equipo y, si el dueño se lo fija, un límite diario propio.
- **Lector** (banco, asesor): ve todo, incluidos historial y documentos, y los descarga; no puede modificar nada, ni desde la app ni directamente contra Supabase (lo impiden las políticas RLS). Su chat con el asistente es privado.
- **"+ Nuevo Parque Solar"** no aparece para quien solo tiene proyectos compartidos (sin ninguno propio). Una cuenta sin ningún proyecto sí lo ve, para crear el primero.
- **Accesos:** se registra cuándo abre el proyecto cada editor o lector (como máximo una vez por hora).
- **Consultas:** el dueño ve cuántas consultas al asistente lleva hoy cada persona, nunca el contenido de su chat.
- **Exportaciones:** cada descarga del análisis financiero (Excel) queda registrada con persona, rol y fecha; el dueño la ve en Equipo y accesos. Si el registro falla, el archivo no se genera.

**Exportar análisis financiero (Excel).** En Finanzas, para todos los roles. Portada, resumen, supuestos con fuente (y el alcance y las limitaciones del modelo), fuentes y usos, deuda, flujo anual de 30 años, impuestos, cronograma de caja mensual, sensibilidad, escenarios de estrés, estado de resultados, balance y flujo de efectivo (más la hoja IVA si está activo), con las cifras del motor de la app: Excel no recalcula nada; solo hay fórmulas en los totales y en las celdas de control (deben dar 0). Las hojas van protegidas sin contraseña, con "Ilustrativo", proyecto, estructura y fecha en cada una. Para cambiar supuestos se usa la app y se vuelve a exportar.

**Depreciación por categorías de activo.** En Editar supuestos se puede repartir el CAPEX entre equipo de generación (100 % en el año 1 por defecto, LISR art. 34 fr. XIII), obra civil, subestación y línea, e interconexión, cada una con su tasa. Apagada por defecto (se usa el esquema de depreciación). Las tasas de las otras categorías las captura el usuario con su asesor fiscal: si una categoría con reparto mayor a 0 % no tiene tasa, la app no calcula TIR, DSCR ni LCOE y muestra una alerta.

**Cupo diario del asistente** (se reinicia a medianoche del Pacífico, igual que la cuota de Google; ver abajo):

| Valor | Predeterminado | Dónde se cambia |
|---|---|---|
| Cupo global diario | 20 (tope del nivel gratuito de Gemini) | `configuracion_asistente.cupo_global_diario` |
| Reserva del dueño | 10 | `configuracion_asistente.reserva_dueno_diaria` |
| Límite por lector | 5 | `configuracion_asistente.limite_lector_defecto`, o por persona en Equipo y accesos |
| Límite por editor | Sin límite propio | Por persona en Equipo y accesos (opcional) |
| Zona horaria del contador | `America/Los_Angeles` | `configuracion_asistente.zona_horaria` |

Solo el dueño usa el cupo global completo. Editores y lectores usan el resto (cupo global menos la reserva del dueño), cada uno con su límite si lo tiene: con los valores predeterminados, el equipo comparte como máximo 10 consultas al día y la reserva de 10 queda siempre para el dueño. Editores y lectores ven "Te quedan N consultas hoy" y, al llegar al límite, un mensaje claro con la hora del reinicio.

**Cuándo se reinicia.** Según la documentación de Google, "Requests per day (RPD) quotas reset at midnight Pacific time" ([límites de la API de Gemini](https://ai.google.dev/gemini-api/docs/rate-limits), consultada el 13 oct 2026). Por eso el contador usa la zona `America/Los_Angeles`: se reinicia a la 1:00 a.m. del centro de México de marzo a noviembre y a las 2:00 a.m. en invierno (México ya no cambia de horario; EE. UU. sí). Si Google cambia la regla, se ajusta `configuracion_asistente.zona_horaria` sin tocar código.

**Si Google responde 429.** La consulta se devuelve al contador (igual que en cualquier fallo de Gemini). Si es la cuota diaria de Google, el usuario ve el mensaje de límite diario con la hora del reinicio; si es el límite por minuto, se le pide esperar un minuto y su contador no cambia.

> **Antes de usar datos reales con el asistente:**
> - **Usa el nivel de pago de Gemini.** En el nivel gratuito, Google puede usar las preguntas y los datos enviados para mejorar sus productos; en el de pago, no.
> - **Con el nivel de pago, sube los límites:** cupo global acorde a tu plan y 25 a 30 consultas por lector. Fija además un **tope de gasto mensual** en Google Cloud (Billing → Budgets & alerts) para que un uso inesperado no genere un cargo alto.
> - Para cambiar los valores: Supabase → SQL Editor → `update configuracion_asistente set cupo_global_diario = …, reserva_dueno_diaria = …, limite_lector_defecto = … where id = true;`

## Publicar la app (Vercel)

> **Las invitaciones solo funcionan con la app publicada** y con la Site URL de Supabase apuntando a ella: el enlace del correo lleva a esa URL. Publica (pasos 1 a 3) y haz la prueba del paso 4 **antes de invitar a personas externas** (bancos, asesores).

La app es estática (Vite): Vercel solo sirve los archivos de `dist/`. No necesita secretos, porque la clave publicable de Supabase es pública por diseño y la de Gemini vive solo en Supabase. `vercel.json` fija el build y agrega cabeceras de seguridad.

1. **Antes de publicar, en Supabase:**
   - **Plantillas en español:** Authentication → Emails → Templates, con el texto de [plantillas-correo.md](plantillas-correo.md).
   - **Correo propio (SMTP):** Authentication → Emails → SMTP Settings, con Resend, SendGrid o tu proveedor de correo. El correo integrado de Supabase permite muy pocos envíos por hora y no es para uso real; sin él, las invitaciones pueden no llegar.
   - **Registro público:** comprueba que siga desactivado ("Allow new users to sign up" apagado). Solo se entra por invitación.
2. **En Vercel:**
   - Add New → Project → importar `robertoi-cd/auragrid`. La primera vez hay que autorizar el acceso de Vercel a GitHub.
   - Deploy: Vercel detecta Vite y ejecuta `npm run build`.
   - Anota la URL, por ejemplo `https://auragrid-xxxx.vercel.app`, o configura tu dominio.
3. **En Supabase → Authentication → URL Configuration:**
   - **Site URL:** la URL de Vercel (o tu dominio). Es a donde llevan los enlaces de invitación y de recuperación.
   - **Redirect URLs:** `https://<tu-url>/**` y `http://localhost:5173/**`. No agregues comodines para las vistas previas de Vercel.
4. **Prueba con un usuario real** (otro correo tuyo):
   1. Authentication → Users → Invite user.
   2. Abre el correo y el enlace: la app pide **definir la contraseña**.
   3. Guárdala, cierra sesión y vuelve a entrar con correo y contraseña.
   4. Crea un proyecto de prueba. El invitado no ve los proyectos de otros usuarios hasta que el dueño lo agrega al equipo (Equipo y accesos…).
   5. Desde tu cuenta, agrégalo a un proyecto como **lector** con límite 2 y comprueba con su sesión: ve el proyecto con "Solo lectura", descarga un documento, no ve botones para editar ni subir, el chat muestra "Te quedan 2 consultas hoy" y a la tercera consulta aparece el mensaje de límite.
   6. Haz una pregunta al asistente.
   7. Cierra sesión, pulsa **¿Olvidaste tu contraseña?**, abre el correo y define otra contraseña.
   8. Repite en el celular y revisa que no haya errores en la consola del navegador.
   9. Abre un enlace ya usado: la app debe decir que venció.
5. **CORS de gemini-proxy (hecho):** el asistente solo responde a los orígenes del secreto `ORIGENES_PERMITIDOS`, separados por comas y sin comodines. Hoy son `https://auragrid-ochre.vercel.app` y `http://localhost:5173`. Si cambias de dominio o quieres probar una vista previa de Vercel, agrega su URL exacta:
   ```bash
   npx supabase secrets set "ORIGENES_PERMITIDOS=https://auragrid-ochre.vercel.app,http://localhost:5173,https://<nuevo-origen>" --project-ref vpsikmgnhubkydftahdl
   ```
   No hace falta redesplegar la función: lee la lista en cada petición. Si un origen no está en la lista, el asistente falla en esa URL con un error de CORS en la consola del navegador.

## Respaldos

El plan gratuito de Supabase **no incluye respaldos** (los diarios empiezan en el plan Pro: 7 días). Por eso hay un script que no necesita Docker ni `pg_dump`:

```powershell
# Exporta todas las tablas a JSON en respaldos\AAAA-MM-DD_HHmm\, con las cuentas y la lista de documentos (solo lectura)
npm run respaldo

# Lo mismo y, además, descarga los documentos del bucket aura-documentos
npm run respaldo -- --con-archivos

# Genera respaldos\...\restaurar.sql a partir de un respaldo (NO lo ejecuta: revísalo antes)
powershell -ExecutionPolicy Bypass -File scripts\restaurar_respaldo.ps1 respaldos\AAAA-MM-DD_HHmm
```

- **La clave secreta (solo la primera vez):**
  1. En Supabase → Settings → API Keys, copia la clave **secret** (`sb_secret_…`). También sirve la `service_role` anterior (pestaña "Legacy API Keys").
  2. Crea en esta carpeta un archivo `.env.respaldo` con una línea: `SUPABASE_SERVICE_ROLE_KEY=sb_secret_…`. También puedes definir la variable de entorno `SUPABASE_SERVICE_ROLE_KEY` en la terminal; si existe, tiene prioridad.
  3. `.env.respaldo` está en `.gitignore` y nunca se sube a GitHub. La clave da acceso total a la base, sin RLS: no la compartas, no la pongas en el código de la app ni en Vercel. Si se filtra, revócala en la misma pantalla y crea otra.
- **Qué guarda el respaldo:**
  - Un `<tabla>.json` por cada tabla de la base, salvo las de PostGIS.
  - `usuarios.json`: id y correo de cada cuenta, para volver a invitar a las personas si se restaura en otro proyecto.
  - `almacenamiento.json`: la lista de documentos del bucket. Con `--con-archivos`, también los archivos, en `archivos/`.
  - `manifiesto.json`: la fecha, las filas de cada tabla y la última migración del repositorio.
  - La estructura de la base está en `supabase/migrations/`.
  - Se escribe primero en una carpeta temporal: si algo falla, no queda un respaldo a medias.
- **Se borran solos (aviso de privacidad: máximo 8 semanas):** después de cada respaldo, el script conserva solo los **8 más recientes** y borra también cualquiera de **más de 8 semanas**, aunque haya menos de 8. Aplica a todo lo que en `respaldos/` empiece con fecha (`AAAA-MM-DD…`), incluidos los respaldos manuales y los de `pg_dump`; por eso estos se nombran con la fecha al inicio.
- **Privacidad:** la carpeta `respaldos/` contiene datos de proyectos y correos. Está en `.gitignore` y no se sube a GitHub. Si quieres una copia fuera de esta computadora, guárdala en un lugar privado y bórrala también a las 8 semanas.
- **Restaurar:**
  - `restaurar_respaldo.ps1` inserta solo las filas que falten (`on conflict do nothing`) y no sobrescribe datos que ya existen.
  - Hoy restaura las 8 tablas principales (proyectos, entregables, garantías y renovaciones, movimientos de caja, supuestos, historial y mensajes del asistente). Las demás (créditos, equipo, evidencias, registros) están en el respaldo, pero hay que restaurarlas a mano (ver ROADMAP).
  - En un proyecto de Supabase nuevo hay que aplicar antes las migraciones y volver a invitar a los usuarios.
- **Respaldo completo con `pg_dump` (esquema y datos), sin Docker.** `npx supabase db dump` necesita Docker; si no lo tienes, instala solo las herramientas de cliente de PostgreSQL:
  1. Descarga el instalador de PostgreSQL para Windows de EnterpriseDB: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads (versión 17, la misma mayor que la base de Supabase; consúltala en Settings → Infrastructure).
  2. En el instalador, en "Select Components", deja marcado **solo "Command Line Tools"** (no hace falta el servidor, pgAdmin ni Stack Builder).
  3. Agrega la carpeta `C:\Program Files\PostgreSQL\17\bin` al PATH (Configuración → Sistema → Acerca de → Configuración avanzada del sistema → Variables de entorno → Path → Nuevo) y abre una terminal nueva. Comprueba con `pg_dump --version`.
     - Alternativa con un gestor de paquetes: `winget install PostgreSQL.PostgreSQL.17` (instala el servidor también; puedes no iniciarlo).
  4. Copia la cadena de conexión en Supabase → Connect → **Session pooler** (puerto 5432; la conexión directa usa IPv6). Contiene la contraseña de la base: no la guardes en el repositorio.
  5. Respaldo completo, en un archivo que se puede restaurar con `pg_restore`:
     ```powershell
     $env:PGPASSWORD = "<contraseña de la base>"   # solo en esta terminal
     pg_dump "postgresql://postgres.<referencia-del-proyecto>@aws-0-<región>.pooler.supabase.com:5432/postgres" --schema=public --no-owner --no-privileges -Fc -f respaldos\AAAA-MM-DD_completo.dump
     ```
     Ajusta el host al que muestra "Connect". Para incluir los permisos (políticas RLS, grants), quita `--no-privileges`. Con la fecha al inicio del nombre, `npm run respaldo` también lo borra a las 8 semanas.
- **Programarlo cada semana** (lunes a las 9:00), con el Programador de tareas de Windows:
  ```powershell
  schtasks /Create /TN "AuraGrid respaldo semanal" /SC WEEKLY /D MON /ST 09:00 /TR "cmd /c cd /d \"<carpeta del proyecto>\" && npm run respaldo -- --con-archivos"
  ```
  Usa la clave de `.env.respaldo`. Si la computadora está apagada a esa hora, la tarea se ejecuta en la siguiente ocasión programada. Respaldar cada semana mantiene 8 semanas de historia; respaldar más seguido, menos semanas (siempre los 8 más recientes).

## Desplegar gemini-proxy

```bash
npx supabase functions deploy gemini-proxy --project-ref vpsikmgnhubkydftahdl --use-api
```

- **Sesión obligatoria:** `supabase/config.toml` fija `verify_jwt = true`, y además la función exige el rol `authenticated`. La clave anónima recibe 401.
- **Pregunta:** solo acepta `{ pregunta, proyecto, alertas, historial }`, con preguntas de hasta 2,000 caracteres.
- **Reintentos:** reintenta errores 5xx y de red. Ante un 429 (cupo de Gemini agotado) no reintenta.

Para comprobar que lo desplegado es igual a lo local:

```bash
npx supabase functions download gemini-proxy --project-ref vpsikmgnhubkydftahdl --use-api --workdir <carpeta temporal>
# y comparar con: Get-FileHash (PowerShell) o sha256sum
```

## Pruebas y verificación

```bash
npm test           # pruebas de reglas, modelo financiero, garantías, historial, exportaciones y verificación de cifras
npm run typecheck  # tsc estricto sobre src/lib, tests y supabase/functions/_shared
npm run build      # build de producción en dist/
```

## Documentos

- `README.md` / `README.es.md`: descripción del proyecto (portafolio).
- `docs/plantillas-correo.md`: correos de invitación y recuperación en español para Supabase.
- [`ROADMAP.md`](../ROADMAP.md): funciones planeadas que aún no están en la app.
- [`EXAMEN_ASISTENTE.md`](../EXAMEN_ASISTENTE.md): examen de 8 preguntas del asistente, respuestas esperadas y registro de ejecuciones.
