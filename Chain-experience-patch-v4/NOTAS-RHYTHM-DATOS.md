# Rhythm v4: datos y estadísticas

La nueva pantalla consume un selector puro (`domain/rhythm.ts`) y un historial local con estados explícitos. No genera actividad al abrir estadísticas ni interpreta una duración planificada como minutos medidos.

## Registro de Chains

Cada nuevo Done o Minimum guarda, dentro del mismo objeto y la misma escritura del estado del hábito, `checkIns[fecha]`: estado, instante ISO, desfase local UTC y si se anotó otra fecha. Es la hora del **registro**, no una prueba de cuándo ocurrió el hábito. Minimum → Done sustituye el registro de esa fecha; repetir Done no crea otro; deshacer elimina el registro. Cambiar a Freeze elimina la muestra de acción.

Las fechas y `completionTimes` anteriores se conservan. No se inventa un desfase horario histórico. Los registros antiguos sin metadatos fiables cuentan como acciones, pero no entran en la distribución de horas. Las correcciones para días anteriores tampoco entran en esa distribución. Los buckets se calculan con el desfase guardado; viajar o cambiar la zona del teléfono después no mueve una muestra a otra hora.

`scheduleHistory` conserva las reglas conocidas desde su fecha efectiva. Los nuevos hábitos empiezan con una revisión en la fecha de creación; editar cadencia/objetivo/descansos añade una revisión desde hoy. Los días anteriores al primer horario conocido usan el horario actual y llevan una advertencia de estimación. No se inventa qué horario regía antes. Un periodo con reglas distintas oculta su tasa única y su comparación para no mezclar obligaciones diferentes. Las revisiones se guardan por día, no por minuto: editar varias veces el mismo día deja la última regla de ese día.

El envelope `@chain_v2` sube de versión 3 a **4**. El proveedor bloquea escrituras cuando la hidratación detecta datos ilegibles o de una versión futura, evitando sustituirlos por el estado visual vacío.

## Definiciones de las métricas

| Métrica | Definición |
| --- | --- |
| Periodos | 7, 28 o 90 fechas de calendario, incluyendo hoy; no fechas anteriores a crear la Chain. |
| Done / Minimum / Freeze | Registros distintos. Una acción registrada en descanso sigue apareciendo como acción; no aumenta obligaciones ni su numerador diario. |
| Consistencia diaria | (Done + Minimum) / días programados **cerrados**. Excluye hoy y los descansos. Freeze conserva la racha, pero no cuenta como actividad. |
| Consistencia semanal | Semanas completas lunes-domingo que llegaron al objetivo / semanas completas cerradas dentro del periodo. Excluye la semana actual, la primera parcial de creación y cualquier semana cuya regla cambió a mitad. No atribuye fallos diarios a un objetivo semanal. |
| Semana actual | Días Done o Minimum hasta hoy. Nunca cuenta una fecha futura del mismo calendario semanal. |
| Comparación diaria | Requiere al menos cinco días programados en cada ventana, igual número de días de calendario cerrados, reglas conocidas y equivalentes. |
| Comparación semanal | Requiere al menos dos semanas completas en cada ventana, igual número de semanas, reglas conocidas y equivalentes. |
| Hora habitual de registro | Al menos cinco muestras locales válidas y un bucket ganador sin empate. Se denomina ventana más frecuente; no implica mayoría, causalidad o momento óptimo para hacer el hábito. |

Sin denominador válido se muestra ausencia de tasa; no se muestra 0 % por falta de historia. La comparación usa puntos porcentuales, no crecimiento porcentual. Las fechas del selector avanzan como claves de calendario UTC al mediodía; no restando bloques de 24 horas del reloj local, lo que evita saltos por DST.

## Focus: una fuente duradera

`PlanStorageState.focusLog` guarda los nuevos registros medidos con `source: 'timer'`. `createPlanStore.completeFocus()` guarda la tarea completada y el registro **en el mismo envelope**. La cancelación de recordatorios se verifica antes de confirmar esa escritura. Si falla el guardado, no queda una tarea completada sin historial ni una sesión ficticia por una escritura parcial.

Plan sube de versión 1 a **2** en `@chain_plan_store`. Un singleton `planDataStore`, en `lib/rhythmStorage.ts`, comparte la cola entre Plan y Rhythm. `readSnapshot()` no materializa días ni tareas repetidas para consultar estadísticas. Las migraciones de formato y la recuperación de un backup válido siguen el repositorio existente.

La finalización es idempotente por tarea/fecha: una ocurrencia conserva un registro medido. Un callback repetido no suma minutos ni cambia su instante. Si después se desmarca o elimina la tarea, el tiempo de su temporizador ya ocurrió y permanece en el historial. Cambiar su Chain tampoco reasigna tiempo antiguo. Copiar/mover una tarea no duplica ese registro. **Volver a cronometrar exactamente la misma ocurrencia tras desmarcarla no añade una segunda sesión en esta versión**; las tareas/ocurrencias nuevas sí tienen nuevos identificadores. Esta es una limitación explícita del registro, no una medición de todas las sesiones posibles.

La pantalla Focus entrega minutos fraccionarios desde segundos transcurridos; no fuerza un minuto mínimo para unos segundos. El selector conserva esa precisión y la interfaz puede presentar “<1”. Un temporizador registra su tiempo transcurrido: no verifica atención humana, productividad o uso de otras apps.

Una sesión guardada puede terminar al día siguiente: se verifica que su snapshot coincida con la tarea/fecha original y que los minutos no superen el tiempo de ese temporizador. La tarea ordinaria no se completa retroactivamente por esta excepción. El log conserva `planDate` para la ocurrencia original y `date` para el día local de finalización. **Toda la duración se atribuye al día de finalización**, sin dividirla artificialmente alrededor de medianoche. La excepción admite el día inmediatamente anterior, no sesiones antiguas arbitrarias; el día de origen debe seguir abierto. Focus también recupera la tarea exacta de la fecha del snapshot cuando la ruta se reabre y ya no aparece en el Plan visible.

## Historia antigua y retención

El archivo antiguo `@chain_focus_log` se lee sin modificar sus bytes. Sus entradas se etiquetan `legacy-unknown`: las versiones anteriores no certificaban en el registro si la duración era planificada o cronometrada. Se informa de su número y se excluyen de los totales medidos. Un registro nuevo del mismo id/fecha prevalece sin doble conteo. Un formato futuro o corrupción ilegible produce un error visible y reintentable, no cero sesiones.

La versión anterior cortaba el archivo en 500 registros. Los que ya fueron descartados no se pueden recuperar con un parche. El archivo nuevo no aplica un recorte silencioso; las pruebas incluyen más de 500 sesiones. El almacenamiento sigue siendo **local al dispositivo**. Este cambio no introduce cuenta, sincronización iCloud, recuperación tras desinstalar ni copia en la nube. El tamaño crece con el historial; la app debe medir el tamaño y rendimiento reales a largo plazo antes de prometer conservación ilimitada.

No volver a v3 después de empezar a registrar con v4: v3 no conoce los envelopes nuevos. La copia automática del aplicador es de **código**, no del almacenamiento de Expo Go/iPhone.

## Verificación realizada

27 pruebas nuevas en `tests/rhythm-data.test.mjs`: 25 iniciales aprobadas en UTC y `TZ=America/Los_Angeles`, más dos regresiones de finalización tras medianoche aprobadas en UTC:

- Registro de fecha local al cruzar UTC, corrección retrospectiva, upgrade, undo y metadatos corruptos.
- Legado sin horas inventadas, descanso, Freeze, hoy pendiente, creación parcial y metas semanales.
- Reglas modificadas, antecedentes desconocidos, muestras mínimas y comparación comparable.
- Minutos fraccionarios, duplicados, fallo de escritura/reintento, cancelación fallida, undo/edición/eliminación/copia y finalización manual.
- Lectura concurrente con escrituras; consulta que no genera Repeat; migración v1, versiones futuras, backup y corrupción.
- Más de 500 registros y calendario cruzando horario de verano.
- Sesión guardada que cruza medianoche, identidad de ocurrencia separada de fecha real del registro, y rechazo de intentos sin snapshot válido.

La suite completa compartida tenía **150/150** pruebas aprobadas antes de las dos regresiones nocturnas; incluye pruebas nuevas de otros trabajos paralelos. La validación final del paquete registra el total combinado actualizado. No equivale a typecheck completo del monorepo ni a validación nativa en iPhone. La compilación Expo/TypeScript y la navegación real deben verificarse en Replit/dispositivo.
