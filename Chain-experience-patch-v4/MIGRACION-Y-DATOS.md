# Datos y compatibilidad de v4

## Qué migra

| Almacenamiento local | V3 → V4 | Motivo |
| --- | --- | --- |
| `@chain_v2` | Envelope 3 → 4 | Añadir metadatos de registros e historial de horarios sin que código anterior los suprima al escribir. |
| `@chain_plan_store` | Envelope 1 → 2 | Guardar tareas, reglas Repeat e historial Focus medido dentro de una misma escritura. |
| `@chain_gate_events_v4` | Nuevo, versión 1 | Eventos de intentos y decisiones de preview, vinculados por identificador. |

Las migraciones se realizan al acceder a los repositorios. Los datos válidos se conservan; no tienes que reconstruir tus Chains ni tareas. Gate importa una sola vez sus marcadores antiguos como no verificables. Las claves antiguas de Gate/Focus no se borran ni se reinterpretan como mediciones nuevas.

Los repositorios conservan una copia previa válida y bloquean escrituras ante formatos futuros o corrupción que no pueden recuperar. Esa copia previa no es una copia permanente de todo el historial y permanece en el mismo dispositivo.

## Reversión

Antes de ejecutar la app v4, la copia de código permite deshacer los cambios de archivos. Después de abrirla, Chains/Plan pueden estar ya migrados: **no vuelvas a v3 restaurando solo el código**. La versión anterior no entiende los nuevos formatos. No borres claves de almacenamiento para forzarla a arrancar.

Si aparece un problema después de abrir v4, conserva los datos y corrige hacia delante sobre v4. Una reversión de datos requeriría una migración específica, revisada y con copia de los datos del dispositivo. Este ZIP no incluye esa operación.

## Qué significa cada registro

- Done/Minimum: estado actual de esa fecha, con instante de registro, desfase UTC local y bandera de corrección retrospectiva. La hora de marcar no demuestra la hora de hacer la actividad.
- Freeze: protege la racha; no se presenta como actividad realizada.
- Horario: se conserva desde que se conoce en v4. Los periodos anteriores pueden ser estimados; se indica. Cambiar reglas oculta comparaciones que mezclen objetivos diferentes.
- Focus: tiempo transcurrido del temporizador, limitado por su duración objetivo; no mide atención humana. La tarea y su medición se confirman juntas. Desmarcar/eliminar la tarea no elimina tiempo que ya se registró.
- Focus nocturno: una sesión guardada de ayer puede finalizar hoy si la tarea de origen sigue abierta. Se conserva la identidad de la ocurrencia y se atribuye toda la duración al día local de finalización. No se divide en minutos por cada día.
- Gate: elegir salir, elegir continuar o no decidir. En esta versión la fuente es preview. No hay resultados observados de otras apps.

## Límites concretos

1. Todo sigue siendo local al dispositivo; no se sincroniza con Replit ni con otro teléfono.
2. El Focus anterior no identifica su procedencia con suficiente fiabilidad: se conserva separado y no infla los minutos nuevos. Los registros que versiones anteriores ya recortaron al superar 500 no se pueden reconstruir.
3. El Focus nuevo no tiene el recorte de 500, pero no se ha validado rendimiento con años de uso. Una misma ocurrencia tiene una medición; rehacerla tras undo no suma otra.
4. El historial activo de Gate conserva 90 días al guardar eventos nuevos. Las consultas no recortan. La copia previa y la clave antigua pueden conservar eventos más viejos.
5. Exportar/importar, copia en nube, borrado integral y telemetría nativa real no están implementados por este parche. No se prometen desde la interfaz nueva.
