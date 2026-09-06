# Chain settings y detalle — v4

Archivos: `app/chain/[id].tsx`, `constants/colors.ts`, `app/chain/new.tsx`.

## Cambios

- Chain settings abre una hoja desde abajo, con el mismo patrón de opciones que Task details: Accent, Schedule/Weekly goal y Minimum version. Se muestra una opción a la vez dentro de la hoja.
- Color y horario conservan su guardado inmediato. Los controles y el cierre se bloquean durante el guardado. Los fallos mantienen el aviso existente; un rechazo inesperado libera el bloqueo y avisa de que no se pudo confirmar el guardado.
- Minimum version se edita dentro de esa misma hoja, con guardado explícito. Cerrar o cambiar de opción con un borrador sin guardar pide conservarlo o descartarlo. No se anidan dos componentes Modal.
- Delete chain conserva la confirmación destructiva y el resultado de persistencia antes de salir.
- Paleta compartida de 18 colores únicos con `CHAIN_COLOR_NAMES`. Se mantienen los once hexadecimales anteriores y se añaden Teal, Sky, Periwinkle, Orchid, Coral, Spring y Slate. Creación de Chain utiliza los mismos nombres. Los colores adicionales también llegan a Task accents porque ya consumía `EXTRA_CHAIN_COLORS`.
- Progress deja de desplegar estadísticas dentro del detalle. La fila Rhythm navega a `/rhythm/[id]`, con `id` de la Chain. El detalle conserva acción de hoy, resumen semanal, calendario y fecha de inicio. Los hitos y análisis se presentan en la nueva pantalla Rhythm.
- Se eliminan `onTouchStart` y `onTouchEnd` del calendario para que no compitan con el gesto nativo de volver. Las flechas de mes permanecen.
- El detalle ofrece una acción secundaria de Log minimum durante todo el día cuando queda pendiente, por debajo de la acción principal. El CTA destacado de Home lo gestiona el cambio horario de v4.
- El resumen semanal de foco utiliza `readRhythmFocusLog()` y recarga cuando la pantalla recupera el foco. Sólo suma entradas con `source: 'timer'`, dentro de la semana y hasta hoy; las entradas antiguas sin medición certificada no se presentan como minutos medidos.

## Verificación realizada

Revisión estática: todos los estilos referenciados están definidos, se retiraron estilos sin uso, hay un único Modal para ajustes, no quedan gestos manuales del calendario ni estados del antiguo desplegable Progress, y la paleta contiene 18 colores distintos con nombres. Revisión de rutas de guardar, fallo, descartar borrador y borrar Chain.

No se ha ejecutado un compilador de TSX ni una compilación nativa en este entorno. No se afirma que la hoja o el gesto hayan sido probados en un iPhone.

## Recorridos a revisar en iPhone

1. Abrir ajustes, desplegar cada opción y cerrar con Done, X y fondo.
2. Cambiar color y días, cerrar y volver a entrar para confirmar persistencia.
3. Editar mínimo, guardar; repetir y cerrar sin guardar, comprobando Keep editing y Discard.
4. Revisar teclado y scroll con tamaño de texto grande.
5. Entrar en Rhythm y volver deslizando lentamente; volver también desde el detalle de Chain.
6. Usar flechas de mes y editar un día; comprobar que deslizar desde el borde ya no cambia el mes.
7. Confirmar que un registro de foco nuevo aparece en el resumen semanal al regresar.
