# Rhythm: pantalla dedicada

Archivo: `artifacts/chain/app/rhythm/[id].tsx`.

## Experiencia

- Pantalla nueva, enlazada desde el detalle de una Chain. El gesto interactivo de volver pertenece al native stack; Rhythm no instala un gesto horizontal ni una animación JavaScript que compita con él.
- Selector persistente durante la visita: últimos 7, 28 o 90 días.
- Cuatro secciones: acciones registradas, constancia, horas de registro y Focus.
- La sección Constancia conserva la progresión de v3: etapa actual, siguiente hito y marcadores 1/7/30/100/365 extraídos de `PROGRESSION_STAGES`. Usan `getStreak` y unidades días/semanas; 365 semanas no se etiqueta como un año. Este bloque pertenece a la racha actual y lo indica, por lo que cambiar 7/28/90 días no altera los hitos. La barra representa progreso real desde el hito anterior sin rellenar artificialmente el 0 %. VoiceOver anuncia cada hito y si se ha alcanzado en la racha actual.
- Se muestran Done, Minimum y Frozen por separado. Convertir Minimum en Done no duplica acciones.
- La tasa diaria evalúa días programados cerrados. Hoy queda fuera; descanso no es incumplimiento y Freeze no se presenta como actividad realizada.
- La tasa semanal evalúa semanas enteras cerradas; semana actual y extremos parciales no se comparan con semanas completas.
- Un cambio de horario dentro del periodo oculta la tasa agregada y su comparación. El historial anterior sin horario guardado lleva una nota de estimación.
- Las horas corresponden a check-ins, no a la hora real del hábito. Registros antiguos sin hora local fiable y correcciones retrospectivas se explican y se excluyen del patrón horario.
- Focus muestra únicamente minutos del temporizador guardados por el nuevo sistema. Los registros antiguos de procedencia ambigua aparecen como excluidos, sin afirmar que fueran minutos medidos.
- Una sesión inferior a un minuto se muestra como `<1`, evitando redondearla a un minuto completo. Las demás cifras admiten un decimal.
- Focus se conserva aunque después se desmarque o elimine la tarea: el tiempo ya se registró. Los registros nuevos no tienen el antiguo recorte silencioso a 500 entradas. Ese límite pertenecía al historial compartido anterior; no es posible reconstruir entradas que ya se descartaron. La interfaz indica que las cifras usan el historial aún disponible.

## Lectura y accesibilidad

- Las cifras usan `domain/rhythm.ts`; la pantalla no mantiene una segunda lógica de rachas o porcentajes.
- Foco se recarga al entrar y al volver del segundo plano. Errores muestran una explicación y Retry, sin convertir una lectura fallida en cero sesiones ni modificar lo guardado.
- La fecha sigue `useLocalClock`, de modo que el periodo cambia al llegar la medianoche local.
- La selección de periodo y la posición de pantalla no se reinician al refrescar Focus.
- Controles táctiles de al menos 44 puntos; textos escalables y tarjetas con distribución flexible; encabezados semánticos, selector con estado de selección y etiquetas de barras para VoiceOver.
- Las barras no dependen exclusivamente del color: cada una tiene texto y cifra. No hay animaciones de gráfico ni efectos de entrada que requieran bloquear el gesto de volver. El botón compartido respeta Reduce Motion y las transiciones se gestionan en el layout raíz.
- Si el enlace se abre sin historial de navegación, volver redirige al detalle de la Chain; si fue eliminada, se ofrece regresar a Chains.

## Comprobación pendiente en dispositivo

No se ha ejecutado esta pantalla en un iPhone desde este entorno. Revisar gesto de volver parcial/cancelado, escalado grande de texto, VoiceOver, cambio de periodo, retorno desde Focus, fechas locales y Retry ante una lectura fallida. Las pruebas del dominio validan los cálculos; no sustituyen esa comprobación visual.
