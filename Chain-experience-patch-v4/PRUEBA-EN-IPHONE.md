# Recorrido de aceptación en tu iPhone

Comprueba primero que `pnpm run typecheck` y `pnpm test` pasan en el proyecto completo de Replit. Anota tu versión de iOS para interpretar dónde empieza el gesto.

| Prueba | Resultado esperado |
| --- | --- |
| Chain → Settings | Hoja desde abajo. Color, horario y mínimo en el mismo panel; una opción desplegada. |
| Colores | Los 18 se pueden elegir. El cambio se mantiene al cerrar y abrir; tareas y nueva Chain comparten acentos. |
| Mínimo escrito sin guardar | Cerrar o cambiar sección ofrece conservar edición o descartar. No pierde el borrador sin avisar. |
| Horario diario/semanal | Descansos y objetivo se guardan; no permite siete descansos. |
| Home antes de 18:00 | El CTA destacado abre la Chain; no ofrece Log minimum. El mínimo secundario sigue disponible dentro. |
| Home desde 18:00 | Si hay un compromiso pendiente, ofrece Log minimum. No aparece si ya está cubierto. |
| App abierta al cruzar umbral | Cambia al próximo minuto; al volver del segundo plano actualiza la hora y el día. |
| Chain → atrás lentamente | La pantalla acompaña el dedo; soltar antes de completar cancela el regreso sin saltar. En iOS anterior a 26, comenzar en el borde izquierdo. |
| Rhythm → atrás; Gate insights → atrás | Mismo patrón. No cambia el mes del calendario al volver del detalle. |
| Reduce Motion | No hay transición animada del stack; los controles siguen funcionando. |
| Rhythm sin historia | No inventa porcentajes, mejor horario ni minutos de foco. |
| Rhythm con Done y Minimum | Ambos se ven separados; hitos conservados; Freeze no suma actividad. |
| Periodos 7/28/90 | Tasas con denominador explícito. Hoy y semana aún abiertos no se dan por fallidos. |
| Cambiar horario | Explica los límites históricos y oculta comparaciones entre reglas distintas. |
| Focus terminado | Tarea y registro aparecen juntos. Unos segundos no se convierten en un minuto entero. Volver a cargar no duplica. |
| Deshacer tarea después de Focus | El estado de tarea cambia; la medición ya registrada permanece. |
| Focus cruza medianoche | Sesión de ayer guardada y día de origen abierto: permite terminar, guarda una medición en el día de finalización. |
| Salir de Focus | Usar su botón: pausa y guarda antes de volver. Su gesto de regreso está desactivado. |
| Preview Gate → salir | Suma una elección de salir, identificada como preview. No suma tiempo ahorrado ni un resultado observado. |
| Preview Gate → continuar | Suma una continuación después de la pausa. |
| Preview Gate → X/atrás/deslizar | Suma un intento sin decisión. No mejora la tasa de salidas. |
| Doble toque y volver mientras guarda | No duplica la elección ni vuelve dos pantallas atrás. |
| Reiniciar app | Conserva estados e historial guardados. |
| Texto grande y VoiceOver | Hoja desplazable, teclado no tapa guardar, controles anuncian selección y los hitos usan días/semanas correctamente. |

Para comprobar el umbral sin cambiar la fecha del teléfono que contiene tus datos, puedes probar con una copia de desarrollo y ajustar temporalmente la constante de hora. Restáurala a 18 antes del uso normal. No alteres datos reales para simular fallos de almacenamiento.

Si ves un salto, envía una grabación corta desde antes de iniciar el gesto hasta después de soltarlo, indicando versión de iOS y pantalla. Si falla typecheck, envía el texto completo del primer error. La revisión visual o de compilación pendiente no queda sustituida por las pruebas de dominio.
