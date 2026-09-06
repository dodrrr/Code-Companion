# Gate insights — parche v4

## Qué cambia

- Gate muestra una entrada a **Gate insights**, con un resumen de los últimos siete días.
- La pantalla de detalle compara periodos de 7, 28 y 90 días: pausas mostradas, elección de salir, elección de continuar, pausas sin decisión y desglose por app de ejemplo.
- La tasa se define exactamente como `leave / (leave + continue)`. Las pausas cerradas sin elegir quedan fuera del denominador; el texto muestra tanto el numerador como el denominador.
- Cada apertura de la demo crea un intento con ID estable. Solo los dos botones de elección crean una decisión. Cerrar con X, volver o deslizar no se interpreta como éxito ni como elección de salir.
- Las elecciones de la demo se etiquetan como **Preview examples**. El botón de salir se llama **Choose to leave** para distinguir la intención registrada del resultado real.

## Límites de medición

El bridge actual no aporta eventos nativos de Screen Time. Por tanto, **App outcomes** muestra **Not available in this build**. No se deducen aperturas, cierres, minutos ahorrados ni distracciones evitadas a partir de AppState, de elegir un botón o de volver a Chain. Todos los resultados posteriores de otras apps son indeterminados.

El esquema distingue intento, decisión y disponibilidad del resultado observado, pero este parche no instala una extensión iOS ni habilita un productor de observaciones nativas. La capa de escritura expone únicamente métodos de preview; los parámetros de navegación no pueden cambiar la procedencia a `native`. Una futura integración deberá especificar qué señal confirma cada resultado y conservar esos límites en la interfaz.

Fuentes primarias consultadas:

- Apple, ShieldActionResponse: https://developer.apple.com/documentation/managedsettings/shieldactionresponse
- Apple, ShieldActionDelegate: https://developer.apple.com/documentation/managedsettings/shieldactiondelegate
- Expo, código nativo personalizado: https://docs.expo.dev/workflow/customizing/

Una respuesta de un shield es una orden de respuesta al sistema. No se presenta aquí como una medición de lo que el usuario hace después. Expo Go no puede incorporar una extensión nativa personalizada mediante este parche JavaScript.

## Guardado y compatibilidad

- Nuevo repositorio local `@chain_gate_events_v4`, envelope versión 1 y copia previa válida `:backup`.
- Cola única para lecturas, migración, intentos y decisiones. IDs de intento y decisión evitan duplicados por efectos repetidos o doble toque.
- Una segunda decisión distinta para el mismo intento y los IDs contradictorios se rechazan; no reescriben lo ya registrado.
- Las lecturas normales no recortan ni borran registros. La migración inicial y la reparación desde backup sí escriben el formato válido.
- El historial activo se limita a 90 días al guardar un evento nuevo, retirando juntos el intento antiguo y su decisión. Los periodos son ventanas móviles de 24 horas × días, atribuidas al momento del intento, no días de calendario.
- Se conserva una copia previa para recuperación. Dicha copia y la clave antigua pueden contener registros anteriores a esos 90 días; no se promete borrado físico inmediato de todas las copias.
- La clave antigua `@chain_gate_save_events` se conserva exactamente como estaba. Se importa una sola vez y su contenido se clasifica como `unverified`, incluso si declaraba `native` o `saved`: el formato no acredita un resultado observado ni un intento independiente.
- Los marcadores antiguos no entran en intentos, decisiones ni tasas nuevas. Los registros antiguos corruptos o con formato desconocido producen error visible, sin sustituirlos por una historia vacía.
- Las versiones futuras del repositorio, incluso en backup, bloquean la escritura para evitar una degradación de formato.
- `getGateSaves24h` y `getGateAttempts24h` conservan firma, pero devuelven cero registros reales: este build no tiene un productor nativo verificado. Propagan fallos de almacenamiento; no convierten un error en una cifra cero.
- Los adaptadores antiguos `recordGateSave` y `recordGateOpenAnyway` siguen siendo exclusivamente ejemplos y no se usan en el flujo nuevo, que vincula la elección al intento real de preview.
- Al volver a la pestaña o recuperar primer plano se actualiza el resumen. Una escritura tardía no intenta navegar de nuevo si la pantalla ya perdió el foco o fue desmontada.
- Todo es almacenamiento local. No hay sincronización de nube o exportación de estos registros en este parche.

## Validación

17 pruebas nuevas pasan mediante `node --no-warnings --experimental-strip-types --test tests/gate-stats-regressions.test.mjs`:

1. Persistencia tras reiniciar el repositorio.
2. Preview sin decisión mantiene estado sin resolver.
3. Aperturas repetidas y doble toque no duplican resultados.
4. 20 intentos/decisiones concurrentes conservados.
5. IDs contradictorios y decisiones opuestas rechazados.
6. Decisión huérfana rechazada.
7. Procedencia nativa falsa y observaciones inventadas rechazadas.
8. Migración de registros antiguos como no verificables, preservando la clave.
9. Historial antiguo corrupto no se transforma en cero registros.
10. Lecturas no destructivas al superar 24 horas o 90 días.
11. Retención elimina intento y decisión juntos al escribir.
12. Fallo de escritura conserva intento y permite reintentar.
13. Recuperación de backup válido.
14. Dos copias corruptas producen error y no se sobrescriben.
15. Versiones futuras de principal y backup rechazadas.
16. Cohortes 7/28/90 y denominador sin pausas indecisas.
17. Tiempos futuros o decisiones previas al intento rechazados.

Revisión independiente del flujo por otro agente: sin nuevos fallos concretos encontrados. No se ha ejecutado una compilación TSX completa ni una prueba de navegación en iPhone desde este subtrabajo; deben formar parte de la validación integrada y la comprobación manual final.

Recorridos manuales: abrir demo y deslizar atrás → +1 indecisa; abrir y elegir salir → +1 elección preview; completar pausa y elegir continuar → +1 continuación preview; tocar dos veces no duplica; ir a otra pantalla mientras guarda no provoca un segundo retroceso; cambiar periodo no conserva cifras del periodo anterior; un error de carga se distingue del vacío.
