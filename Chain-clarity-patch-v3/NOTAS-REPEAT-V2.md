# Repeat — funcionamiento y migración en v2

## Qué cambia para ti

Repeat guarda una regla independiente. Si eliges lunes, miércoles y viernes, la tarea aparece al cargar cada fecha, aunque no abras Plan los días intermedios. Volver a cargar una fecha no añade otra copia. No genera retrospectivamente tareas en días pasados que nunca se guardaron.

- Editar una tarea de una serie cambia esa fecha y las posteriores. Las ocurrencias futuras ya completadas y el historial anterior se conservan.
- Quitar todos los días de Repeat detiene la serie desde la fecha editada. Las ocurrencias futuras generadas y pendientes se retiran. Las tareas copiadas manualmente se conservan.
- Borrar una ocurrencia solo excluye esa fecha. No detiene la serie. Para detenerla, edita la tarea y quita los días de Repeat antes de borrarla.
- Una copia manual puede sustituir a la ocurrencia automática pendiente del destino para evitar un duplicado. Copiar explícitamente varias veces sigue siendo una acción manual.
- Mover usa dos guardados consecutivos, destino primero. Si falla el segundo puede quedar una copia en ambos días; no se presenta como una transacción atómica de traslado.
- Las nuevas ocurrencias no heredan finalización, prioridad ni un recordatorio que no se haya programado. Conservan texto, hora, color, duración y vínculos configurados. Los recordatorios se configuran por tarea.
- Si un cambio altera texto, hora o Chain vinculada de una tarea futura con recordatorio, se cancela el aviso anterior y se limpian sus datos. Hay que configurar el nuevo aviso. Si no se puede cancelar, se rechaza el cambio de serie.

## Primera apertura después de aplicar el parche

Se leen todas las fechas guardadas con el formato anterior, incluido su historial y metadatos de recordatorios. La copia de respaldo se usa si la principal no se puede leer. Las claves antiguas no se borran ni se sobrescriben.

Para activar reglas antiguas automáticamente se consideran solo las tareas de hoy y mañana con una configuración de Repeat inequívoca. Si dos copias de una misma serie discrepan, se conservan ambas tareas y no se elige una configuración por ti. Tampoco se reactiva una serie solo porque aparezca en el historial antiguo.

**Después de actualizar, revisa tus repeticiones:** guarda de nuevo los días de Repeat en las tareas que quieras mantener. Si la tarea solo existe en un día histórico que no puedes editar desde la interfaz, créala de nuevo con el horario deseado. Esta comprobación es necesaria porque el formato anterior no guardaba una intención duradera de repetir o detener una serie.

Si alguna fecha no puede leerse ni desde su respaldo, o pertenece a un formato futuro, la migración se detiene. Plan muestra un mensaje y Retry; no ofrece un plan vacío editable. Los datos anteriores siguen disponibles para investigar el caso. Reintentar no soluciona por sí solo un archivo corrupto: no borres los datos de Expo Go para hacerlo desaparecer.

## Compatibilidad y reversión

El nuevo formato se guarda en `@chain_plan_store`, con versión y respaldo. Incluye fechas, reglas con revisiones y excepciones de borrado. Los cambios de una serie y sus ocurrencias se guardan juntos. Las colas de guardado cubren todas las fechas.

El código anterior no conoce este formato. **Volver al código anterior después de registrar trabajo con v2 puede mostrar los datos antiguos y ocultar los nuevos.** Conservar las claves anteriores sirve para recuperación, pero no sincroniza ambas versiones. El respaldo de código que crea el aplicador tampoco copia los datos del iPhone.

No se añade un migrador inverso ni una herramienta de exportación. Evita alternar versiones después de empezar a registrar trabajo con v2.

## Comprobaciones y límites

17 pruebas específicas cubren reinicio, días saltados, duplicados, eliminación de una ocurrencia, edición y parada de serie, recordatorios, errores de cancelación y guardado, concurrencia entre fechas, migración, corrupción y versiones futuras. Son pruebas de dominio y persistencia con almacenamiento y cancelación de avisos simulados.

La cancelación real de notificaciones, la interfaz React Native y el typecheck del monorepo completo deben comprobarse en Replit y en el iPhone. No se han validado aquí. Un fallo simultáneo del guardado y de la reparación posterior de metadatos no puede resolverse automáticamente; la reparación tras cancelar un aviso es de mejor esfuerzo.
