# Chain detail — claridad v3

## Alcance

Solo cambia `artifacts/chain/app/chain/[id].tsx` respecto a stability v2.

- Orden inicial: nombre → estado y acción de hoy → resumen semanal → historial mensual. La racha sigue visible sobre el calendario.
- `Progress`, cerrado al entrar, agrupa el hero de racha, hitos, totales y Rhythm. `Chain settings`, también plegable, reúne color, horario/objetivo, mínimo, recuperación de Freeze y borrado con su confirmación existente. El horario ya no exige abrir un segundo desplegable.
- Texto de hoy explícito para Done, Minimum, Frozen y objetivo semanal completo. En Minimum el botón muestra el símbolo de mínimo y sigue convirtiendo a Done con un toque. Se elimina el banner Frozen duplicado porque el estado ya aparece junto a la acción.
- El resumen semanal habla de días y minutos de foco registrados; no afirma haber observado tiempo efectivo de trabajo. Rhythm muestra el número de check-ins sobre el que se calcula el patrón.
- Rhythm describe la hora y el día de check-ins de versión completa. Se conserva el umbral de tres timestamps. La franja pasa de dos horas a una para coincidir con el bucket horario que realmente se calcula. El día mostrado usa los mismos check-ins; deja de mezclar ese dato con el weekday de mayor suma de minutos de Plan. Los registros originales y los totales de minutos se conservan.
- Desaparecen las afirmaciones de “best window”, “strongest day” y de ritmo definitivamente adquirido. No se añade ninguna nueva métrica ni regla de rachas.
- Desplegables con estado expandido anunciado; nombre con semántica de encabezado; texto de acción puede ajustarse al espacio disponible.

## Revisión

Comparados con v2: los 15 handlers internos de navegación, persistencia, colores, mínimo, horario, historial, Freeze y borrado son idénticos. Se mantienen la corrección Minimum → Done, la prohibición de Freeze semanal, el límite de seis descansos, los estados legacy de Freeze y la edición de historial limitada a hoy y tres días anteriores.

Revisión estática del archivo, referencias de estado/estilos y estructura JSX. Sin nuevas dependencias ni tests que reproduzcan el JSX. El archivo requiere la comprobación global de sintaxis/typecheck que se haga con el paquete; aquí no se ha ejecutado en Expo Go ni en iPhone. En dispositivo conviene revisar ambos desplegables, texto grande, una Chain semanal al completar su objetivo y una diaria con mínimo/Freeze.
