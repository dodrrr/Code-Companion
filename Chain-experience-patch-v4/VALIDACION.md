# Validación de Chain Experience v4

Fecha: 6 de septiembre de 2026. Base: copia revisada de Chain clarity v3. Resultado: 26 archivos de aplicación incluidos, 16 sustituciones y 10 archivos nuevos. Sin cambios en dependencias.

## Pruebas ejecutadas

| Comprobación | Resultado |
| --- | --- |
| Suite completa de dominio y persistencia | **152 aprobadas, 0 fallos**, ninguna omitida. |
| Nuevas pruebas Rhythm/datos | **27 aprobadas**, incluidas en las 152. |
| Nuevas pruebas Gate | **17 aprobadas**, incluidas en las 152. |
| Rhythm con TZ=America/Los_Angeles | **27 aprobadas**, ejecución adicional para resolver riesgos de calendario/zona. |
| Aplicador --check sobre v3 | Solo lectura; no cambia archivos ni crea copia. |
| Git diff --check sobre v3 | Aplicable sin conflictos. |
| Archivo con una edición local desconocida | Rechazo de todo el lote; no modifica otros archivos ni crea copia. |
| Aplicador --apply sobre v3 | Los 26 archivos finales coinciden con su SHA-256. |
| Copia previa de código | Las 16 versiones anteriores coinciden; se identifican los 10 archivos nuevos. |
| Segunda aplicación | No repite cambios ni crea otra copia. |

Comando de pruebas desde la carpeta de la app:

```bash
node --no-warnings --experimental-strip-types --test tests/*.test.mjs
```

Las pruebas cubren reglas de Chain, Repeat, Focus, repositorios y contratos existentes, además de las regresiones nuevas. Incluyen fallo de escritura, reintento, concurrencia, doble toque, formatos futuros, recuperación desde copia válida, conservación de historia antigua, ventanas y denominadores, muestras horarias, horario de verano y Focus al cruzar medianoche.

## Revisión de integración

Revisión estática de las rutas y sus contratos de datos. Una revisión independiente detectó y permitió corregir:

- Cifras de Focus ambiguas al fallar la lectura del detalle: ahora hay estados de carga/error y no se presentan como cero.
- Pérdida de los hitos de v3 al crear Rhythm: se han conservado dentro de Consistency.
- Lectura de una tarea de Focus antigua mediante una API que ocultaba el error: ahora usa lectura estricta del repositorio compartido.
- Finalización de una sesión al pasar medianoche: ahora admite una sesión guardada del día anterior, con identidad y tiempo validados.

Se revisaron también los guardados de la hoja, los borradores de mínimo, el conflicto de gestos del calendario, los estados sin decisión de Gate y la ausencia de procedencia nativa inventada. La revisión por lectura no es una prueba visual.

## Comprobaciones pendientes

**No se ejecutó el typecheck completo ni una compilación Expo.** El ZIP base no trae el monorepo/dependencias completos necesarios; su tsconfig referencia `../../lib/api-client-react`. No se reconstruyeron esas dependencias con sustitutos ni se modificó la configuración para hacer pasar una comprobación parcial.

Las pruebas anteriores ejecutan TypeScript de dominio con Node; no comprueban los tipos de React Native/Expo, la sintaxis TSX mediante Metro ni el renderizado de las pantallas. Ejecuta `pnpm run typecheck` y `pnpm test` en Replit antes de abrir v4 con tus datos habituales.

No hubo iPhone, simulador iOS, prueba de VoiceOver ni medición de fotogramas. Por ello no se certifica que el salto percibido haya desaparecido en tu dispositivo: se ha sustituido su configuración y retirado los gestos que competían. Usa `PRUEBA-EN-IPHONE.md` para comprobarlo.

No se verificó bloqueo real de aplicaciones, eventos posteriores de Screen Time ni suscripciones. El parche instrumenta las elecciones de la preview y declara la ausencia de resultados observados.

No se ha hecho un despliegue en tu Replit: el ZIP es para que lo apliques manualmente.
