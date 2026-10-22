# Ideas y límites de esta versión (v1), no compromisos

Lo que todavía no está en la app. No hay fechas ni entregables comprometidos: cada punto indica qué faltaría para hacerlo.

## Ideas fuera del alcance de la v1

- **Data room:** un espacio con permisos para compartir los documentos de la debida diligencia con bancos y asesores, sobre los roles (dueño, editor y lector), el almacenamiento privado y el registro de accesos que ya existen.
- **Buscador de terrenos (GHI por coordenada, exportación KML/KMZ):** buscar y filtrar sitios con coordenadas, recurso solar por ubicación en lugar del promedio estatal y exportación del polígono, la subestación y la línea de interconexión. El detalle está en "Módulo de terrenos (Sitios)", abajo.

## Módulo de terrenos (Sitios)

- Exportación KML/KMZ: polígono del terreno, POI/subestación, línea de interconexión, exclusiones e implante.
  - **Requisito:** guardar la geometría del proyecto en Supabase; hoy no hay coordenadas.
  - **Antecedente:** la descarga KML del asistente se quitó porque solo podía exportar coordenadas escritas por el modelo, no datos del proyecto.
- GHI y producción específica por coordenada del terreno, en lugar del promedio estatal del formulario de proyecto nuevo.
  - **Fuente:** Global Solar Atlas (la misma API pública que generó los promedios estatales) o el estudio de recurso del sitio.
  - **Requisito:** las coordenadas del terreno de este módulo.
  - Un valor capturado por el usuario (estudio de recurso o PVsyst) sigue teniendo prioridad.

## Esquema de interconexión CFE

- Registrar por proyecto:
  - punto de interconexión (subestación, tensión y bahía);
  - longitud y tipo de la línea;
  - obras de refuerzo que pida CENACE;
  - costos del estudio de instalaciones.
- **Requisitos:** tabla propia con RLS por dueño. El costo de interconexión del modelo financiero se tomaría de aquí, en lugar del perfil de referencia del formulario de proyecto nuevo.

## Lectura de documentos

- Subir permisos, contratos, fianzas y term sheets, y que la app extraiga fechas, montos y vigencias para proponerlos como datos del proyecto. El usuario los confirma antes de guardarlos.
- **Requisitos:**
  - almacenamiento privado por proyecto (Supabase Storage con RLS);
  - extracción en una Edge Function, sin exponer claves en el navegador;
  - nunca escribir datos sin confirmación.

## Dependencias entre entregables

- Indicar que un entregable depende de otro (p. ej. resolutivo de MIA antes de la licencia de construcción).
- La app calcularía la ruta crítica hacia el RTB y movería el RTB proyectado cuando se retrase un predecesor.
- La exportación a MS Project incluiría las predecesoras.
- **Requisitos:** tabla de dependencias con validación de ciclos; ajustar `calcularAvance` y `planMsProject`.

## Reportes generados desde datos

- Reportes periódicos (estado para socios o banco, avance a RTB, garantías por vencer, fondeo) armados directamente con los datos y cálculos de la app, sin pasar por el asistente.
- Las descargas actuales salen de respuestas del asistente con un anexo de cifras.
- **Requisitos:** plantillas fijas en PDF, Word y Excel a partir de `finanzas`, `rentabilidad`, alertas e historial; fecha de corte en cada reporte.

## Monitoreo regulatorio

- Avisar de cambios en normas y procesos que afectan el camino a RTB: CNE (antes CRE), CENACE (Manual de Interconexión y garantías), SEMARNAT, SENER (EVIS) y LISR (depreciación).
- Al detectar un cambio relevante, marcar los entregables o supuestos afectados.
- **Requisitos:**
  - fuentes oficiales definidas, como el DOF y los sitios de cada dependencia;
  - revisión humana antes de cambiar reglas de validación;
  - registro de qué versión de cada norma usa la app (p. ej. la vigencia de la garantía de interconexión, hoy "por confirmar").

## ✅ Terminado: módulo financiero v1 (oct 2026)

Cerrado el 20 oct 2026. El usuario verificó de forma independiente cada bloque con Alpha I (cifras, Excel recalculado celda por celda y controles).

- **Modelo:** producción P50/P90 por estructura, ingresos PPA y mercado, OPEX, deuda esculpida por DSCR P50/P90 y apalancamiento, intereses de construcción mes a mes, DSRA, ISR con pérdidas que caducan (LISR art. 57) y depreciación fiscal por esquema o por categorías.
- **IVA de construcción v1** (ver abajo), **varios bancos v1** y **nivel bancario A** (escenarios de estrés, LLCR/PLCR, puntos de quiebre, COD +6 meses con DSRA, MMRA, lock-up).
- **Estados financieros v1** (migración 20261026100000_devolucion_capital_variable, aplicada):
  - estado de resultados con depreciación contable e ISR diferido (NIF D-4);
  - balance con control activo − pasivo − capital = 0 en todos los años;
  - flujo de efectivo cuadrado contra la caja del balance;
  - dividendos con reserva legal (LGSM art. 20) y utilidades acumuladas (art. 19), caja atrapada, lock-up, liquidación al final y devolución de capital variable opcional;
  - tres TIR de equity: flujo disponible, dividendos y devolución de capital, y solo dividendos;
  - pestaña "Estados financieros" en Finanzas y hojas "Estado de resultados", "Balance" y "Flujo de efectivo" en el Excel, con los controles en fórmula; las hojas existentes, idénticas celda por celda.
- **Siguiente:** el módulo financiero v2 es el bloque B de "Nivel bancario" (abajo).

## ✅ Terminado: IVA de construcción v1 (oct 2026)

Módulo cerrado el 19 oct 2026. El usuario lo verificó de forma independiente: cifras, controles y reconciliación de la TIR en los dos Excel (con equity y con línea), recalculando todo el libro.

- **Fase 1, motor**: IVA por mes sobre los pagos de obra y equipos; TIR con descuento mensual exacto (flujos anuales en t = k y flujos del IVA en meses/12 desde el NTP); compromiso de equity por IVA; línea de IVA con tasa y comisión.
- **Fase 2, pantallas** (migración 20261022100000_iva_supuestos, aplicada):
  - editor de supuestos con datos obligatorios (origen del equipo, financiamiento, % sujeto, meses de recuperación y, con línea, monto en equivalente USD, tasa y comisión); la tasa viene prellenada en 16 % (LIVA art. 1);
  - tarjeta "IVA de construcción" en Finanzas, IVA por mes en el cronograma de caja, hueco de caja con IVA y una sola alerta por el mismo IVA;
  - costo financiero (valor presente al NTP) a la TIR objetivo de equity si está capturada y, si no, a la TIR sin IVA; impacto en la TIR en pp.
- **Fase 3, Excel**:
  - hoja "IVA" mensual con sus controles: pagado − recuperado − saldo final = 0; suma de flujos = 0; con línea, cada mes disposición + IVA con equity = IVA pagado;
  - reconciliación de la TIR: TIR sin IVA (IRR de "Flujo anual"), efecto en pp, TIR con IVA y tablas de flujos con su momento, con control de valor presente = 0;
  - columnas de IVA en "Cronograma de caja", "Necesidad temporal de IVA" en "Fuentes y usos" y supuestos con "Sin capturar";
  - con el IVA apagado, el libro es idéntico byte por byte (salvo el ancho de la columna A del cronograma, que se ensanchó después).

### Pendientes del IVA (anotados durante el módulo)
- **Línea IVA: comisión por no disposición** sobre el saldo no dispuesto (0.3–0.5 % anual, capturada). Hoy el modelo solo cobra la comisión de apertura (sobre el monto máximo) y los intereses sobre el saldo dispuesto.
- **Fecha real de importación (pedimento):** hoy el IVA del equipo importado se fecha en el hito de entrega como aproximación (limitación visible en el tablero y en el Excel).
- **Deducción en el ISR de los intereses y la comisión de la línea IVA:** no se deducen en esta versión (limitación visible).
- **Línea IVA en pesos (TIIE + margen) y tipo de cambio:** el modelo está en USD; ver "Moneda MXN/USD y tipo de cambio" en "Ruta a RTB v1.1".
- **Tasa de 8 % en la región fronteriza norte:** hoy se captura a mano (la tasa es editable y lleva la nota); validar con asesor fiscal.
- **Fuera de alcance de v1:** IVA de operación, el resto de los trámites de aduanas (aranceles, DTA y pedimentos detallados) y casos especiales.

## Financiamiento con varios bancos

### ✅ v1 terminada (oct 2026)

Cerrada el 19 oct 2026. El usuario verificó de forma independiente las cifras (casos A–E), los repartos por banco y los dos Excel recalculados (20 controles en 0 en cada uno).

- **Fase 1, motor** (migración 20261023100000_creditos_deuda, aplicada):
  - créditos en `project_loans`: banco, participación (suman 100 %), tasa anual total, comisión de estructuración, comisión por no disposición (opcional) y estado;
  - proyectos existentes migrados como un crédito al 100 % con su tasa y comisión, aprobado y sin banco; ninguna cifra cambió;
  - la deuda total se dimensiona igual que antes (DSCR P50/P90, apalancamiento máximo, ingresos sin contrato) sobre el servicio total; con el mismo plazo y perfil para todos, equivale a un crédito a la tasa Σ wᵢ·rᵢ con comisiones Σ wᵢ·cᵢ;
  - resultados por crédito (saldo, intereses, amortización, comisiones e intereses de construcción) con Σ por crédito = total;
  - desembolsos: cada tramo (Tramo 1, Tramo 2 o los fondos de deuda capturados) se reparte por participación; confirmado = condición del desembolso y crédito aprobado;
  - comisión por no disposición del NTP a la COD como costo de construcción (circularidad con el apalancamiento resuelta en el punto fijo, con alerta si no converge);
  - participaciones que no suman 100 % o condiciones sin capturar: alerta y TIR/DSCR en N/D;
  - `tasa_interes_pct` y `comision_estructuracion_pct` de los supuestos quedan en desuso (comentario en la columna; ninguna pantalla, exportación ni el asistente las lee ni las escribe).
- **Fase 2, pantallas**: tabla de créditos editable (dueño y editor; el lector solo ve), tasa ponderada, resultados por banco y "Desembolsos"; crédito indicativo ("Por definir", pendiente) y aviso "Financiamiento indicativo: aún sin banco" en el Resumen y en Inicio.
- **Fase 3, Excel**: hoja Deuda con una sección por banco y una de totales con controles con fórmula (Σ por banco = total en saldo, intereses, amortización, IDC y comisiones; Σ participaciones = 100 %); fila de comisión por no disposición en Fuentes y usos cuando es mayor a 0. Con un crédito al 100 %, el libro es idéntico byte por byte.
- **Nota en el cronograma de caja** (app y Excel): los tramos son fechas de disponibilidad; los intereses de construcción y la comisión por no disposición se calculan con la disposición según necesidad (primero el equity).

### v2 (pendiente)
- Plazos distintos por banco (el más corto amortiza primero).
- Deuda subordinada, con DSCR senior y total.
- Créditos en MXN/TIIE y en USD/SOFR, con cobertura de tasa.

## Antes de clientes reales

### Contexto del asistente construido en el servidor — cerrar antes de clientes reales / plan pagado de Gemini
- **Hoy:** `gemini-proxy` cobra la consulta según el `projectId`, pero usa los datos del proyecto y las alertas que manda el navegador. Alguien que es dueño de un proyecto y lector de otro podría, con una petición armada a mano, consultar el proyecto donde es lector con su cupo de dueño.
- **Riesgo actual: bajo.** Requiere una petición manual, solo expone datos que el usuario ya puede leer y queda acotado a su cupo de dueño. Desde la app no ocurre.
- **No sirve:** comprobar el nombre o el id que manda el navegador; también se pueden falsificar.
- **Solución:** que `gemini-proxy` construya el contexto del proyecto en el servidor a partir del `projectId`, con la sesión del usuario (RLS), y no acepte datos del proyecto desde el navegador. Implica llevar al servidor la cadena de cifras y alertas (`analizarProyecto` / `validarProyecto`).

### Créditos de la deuda en el asistente
- El asistente recibe bancos, tasas y estados de los créditos: información comercial confidencial; requiere el plan pagado de Gemini antes de datos reales.

### ✅ Objetos antiguos del prototipo: eliminados (22 oct 2026)
- **Migración 20261028100000_limpiar_prototipo (aplicada):** 37 tablas (24 con datos de prueba, 48 filas en total; 13 vacías, entre ellas las 4 de data room, que se diseñará de nuevo con el modelo de permisos actual), 3 vistas, 8 funciones y la tarea de pg_cron `refresh-regulatory-audit-view`. Quedan las 16 tablas de la app, todas con RLS.
- **Migración 20261028110000_retirar_postgis (aplicada):** se retiró PostGIS, la única forma de cerrar la escritura anónima en `spatial_ref_sys` (tabla de la extensión, propiedad de `supabase_admin`). Cuando el módulo de terrenos lo necesite: `create extension postgis with schema extensions;`.
- **Se conserva** la tarea `delete-unverified-users`: borra las cuentas sin confirmar con más de 30 días, así que una invitación que no se acepta en ese plazo se borra.

### Registro de proyectos eliminados
- Registro de proyectos eliminados (id, nombre, quién y cuándo) en una tabla sin llave foránea al proyecto, para auditoría de borrados. Hoy, al borrar un proyecto, su historial se borra en cascada y no queda rastro del borrado.

### Monitoreo de errores
- Monitoreo de errores (p. ej. Sentry).

### Correos del equipo ocultos para el lector también en los datos
- **Hoy:** el historial oculta en pantalla, para el lector, los correos de otras personas, pero las reglas de acceso (RLS) le permiten leer `project_change_log` completo, con los correos.
- **Solución:** correos del equipo ocultos para el lector también en los datos (vista o función en el servidor que los enmascare), no solo en pantalla.

## Pendientes pequeños

- **Restaurar todas las tablas:** `npm run respaldo` ya guarda todas, pero `scripts/restaurar_respaldo.ps1` solo restaura las 8 principales. Agregar créditos (`project_loans`), equipo (`project_members`), evidencias y registros, en orden de dependencias y sin que los triggers del historial dupliquen registros.
- **Ambientes:** mover la URL y la clave publicable de Supabase a variables `VITE_` cuando haya ambientes de prueba y producción (hoy están en `src/supabase.js`; la seguridad la da el RLS).
- **Opción por proyecto: los lectores pueden descargar documentos (la decide el dueño).** Hoy el lector siempre puede descargar.
- **Ventanas de editar proyecto y equipo con el estilo oscuro** (hoy son claras; se abren desde Configuración).
- **Próximos vencimientos en Inicio:** una sección con los vencimientos más cercanos de todos los proyectos (garantías, entregables, desembolsos), con enlace a su módulo.
- **Textos de control del Excel con fórmula y formato condicional:** hecho: =IF(B<fila>=0,"Correcto (da 0)","Revisar…") y verde/rojo por formato condicional en todas las hojas.
- **Prueba real de la depreciación por categorías:** pendiente del usuario. Activar en Editar supuestos con 80 % equipo de generación (100 % anual) y 20 % obra civil (5 % anual) y exportar. Esperado: depreciación año 1 USD 37,665,000; años 2 a 20, USD 465,000; TIR de equity 8.3 %; deuda USD 28,912,692; pérdida que caduca USD 6,306,621.

## Nivel bancario

Lo que un banco o un asesor técnico pedirá además del modelo actual. Referencia de la revisión independiente del usuario (Alpha I, 13 oct 2026): **LLCR ≈ 1.414x**; **caída de ingresos tolerable: 15.8 % hasta el covenant (1.15x) y 24.5 % hasta DSCR 1.0x**, con la deuda fija y el ISR recalculado (corregido el 19 oct 2026: la cifra anterior, 17 %, se había calculado con el ISR fijo). Las cifras de la app deben coincidir con esa referencia.

### ✅ A. Terminado (oct 2026)

Cerrado el 19 oct 2026. El usuario verificó de forma independiente todas las cifras de Alpha I (escenarios, LLCR/PLCR, puntos de quiebre y COD +6 meses).

- **Fase 1, motor**: escenarios con la deuda fija del caso base (mismo monto, calendario y DSRA) e ISR recalculado; DSCR mínimo y promedio, LLCR, PLCR, TIR y años bajo el covenant; puntos de quiebre de ingresos (Alpha I: 15.8 % hasta el covenant y 24.5 % hasta 1.0x).
- **Fase 2, riesgos** (migración 20261024100000_riesgos_operacion, aplicada): COD +6 meses (servicio fijo en fechas, PPA desde la COD, DSRA que cubre el faltante y se repone antes del equity, intereses adicionales con equity, penalización del EPC); disponibilidad y curtailment; reemplazo de inversores con reserva MMRA; alertas de lock-up y "Sin cola de PPA". Vacío = no aplica.
- **Fase 3, pantallas y Excel:** tabla "Escenarios de estrés" en Finanzas (en rojo lo que baja del covenant) con el detalle del COD +6 y el mensaje de dispensa (waiver); LLCR, PLCR y caída de ingresos tolerable en los indicadores; hoja "Escenarios" y LLCR/PLCR en el Resumen del Excel. Las otras hojas quedan idénticas celda por celda (criterio acordado: los índices de textos y estilos comunes del libro sí se recorren).

Alcance original, cumplido con los ajustes acordados (P90 solo el año 1 y P90 todos los años en lugar de "10 años"; LLCR y PLCR por escenario en la hoja Escenarios y en el Resumen, no por año en la hoja Deuda; además P90 + OPEX +10 % y lock-up):

1. **LLCR y PLCR por año y DSCR promedio**, en el tablero, en el Excel (hoja Deuda) y en el resumen.
2. **Tabla de escenarios de estrés**, cada uno con DSCR mínimo, LLCR y TIR de equity:
   - P90 1 año y P90 10 años;
   - CAPEX +10 %;
   - OPEX +10 %;
   - COD +6 meses;
   - tasa de interés +100 pb;
   - precio de mercado −20 %.
3. **Punto de quiebre de ingresos:** la caída de ingresos que lleva el DSCR a 1.0x.
4. **Reemplazo de inversores con cuenta de reserva (MMRA):** costo y año del reemplazo, y aportaciones a la reserva en el flujo.
5. **Supuestos de disponibilidad y curtailment** (% de energía perdida), aplicados a la producción P50 y P90.
6. **Alerta "Sin cola de PPA":** "el plazo de la deuda iguala al del PPA; los bancos suelen pedir 1–3 años de cola". Hoy solo hay alerta cuando la deuda es más larga que el PPA.

### B. Módulo financiero v2 (después de la retroalimentación de usuarios)

Se retoma cuando haya retroalimentación de usuarios reales; las prioridades pueden cambiar con ella.

1. **Periodicidad semestral** del servicio de la deuda y **año parcial desde el COD**.
2. ~~Estados financieros completos con control de balance y restricción de dividendos~~: ✅ hecho en el módulo financiero v1. Para la v2: **préstamo de socios** (deuda subordinada), **CUFIN e ISR por dividendos**, **capital fijo mínimo** en la devolución de capital variable (LGSM art. 9) y dividendos contra los estados del año anterior.
3. **Límite de deducción de intereses, retención de dividendos y PTU.** A validar con asesor fiscal.
4. **Contingencia de construcción, comisión por compromiso y cobertura de tasa** (swap) en fuentes y usos y en el flujo.
5. **COD con retraso y el PPA:** el retraso puede generar penalizaciones al comprador del PPA o la terminación si se pasa la fecha límite de inicio; hoy no se modela (el escenario COD +6 meses supone que el PPA empieza en la COD).

## Ruta a RTB v1.1

- **IVA del CAPEX (16 %):** ✅ hecho (oct 2026); ver "Terminado: IVA de construcción v1" arriba.
- **Moneda MXN/USD y tipo de cambio:** hoy todo el modelo está en USD (el tablero, la portada y la hoja Supuestos del Excel lo advierten: el ISR se determina en pesos y el tipo de cambio puede modificar el escudo fiscal).
  - **(a) Moneda por concepto:** cada ingreso, costo, pago y fuente en MXN o USD, con un supuesto de tipo de cambio y sensibilidad a la depreciación del peso.
  - **(b) ISR en pesos:** base gravable determinada en pesos, con la depreciación al tipo de cambio de la fecha de compra y las ganancias o pérdidas cambiarias de la deuda en USD. Validar con asesor fiscal.
  - **Requisito:** fuente del tipo de cambio (Banxico, FIX).
- **Presupuesto de desarrollo (DEVEX) frente a lo ejercido:** presupuesto por frente y entregable, gasto real capturado y desviaciones con alerta.
- **Evidencia documental por entregable:** ✅ hecho (oct 2026): documentos por entregable en el bucket privado `aura-documentos`, con historial y motivo al eliminar. Se permite "Completo" sin documento, con alerta informativa y etiqueta "Sin evidencia".
  - Se relaciona con "Lectura de documentos".
- **Avisos por correo de vencimientos:** entregables y garantías por vencer o vencidos, enviados al responsable, con frecuencia configurable.
  - **Requisitos:** SMTP propio y una tarea programada (Edge Function con cron).
- **Roles de equipo (lectura para bancos):** ✅ hecho (oct 2026): dueño, editor y lector con RLS por rol, registro de accesos y cupo diario del asistente por lector.
- **Botón "Invitar" en la app:** hoy se invita desde Supabase y después se agrega a la persona en Equipo y accesos. Con SMTP propio, el dueño podrá invitar por correo desde la app (Edge Function con la clave de servicio, solo para el dueño del proyecto), con el rol y el límite ya asignados.
  - **Requisitos:** SMTP propio y la app publicada con su Site URL.
