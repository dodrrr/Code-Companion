# Chain — parche de claridad v3

## Qué mejora frente a v2

- La acción de hoy aparece al principio del detalle. La configuración queda en Chain settings y los análisis en Progress, ambos plegables.
- Los insights describen horas de check-in y minutos de foco registrados, sin presentarlos como la hora real de la actividad o una recomendación de cuándo rendirás mejor.
- Los días extra semanales se reconocen dentro de la tarjeta, sin un modal que tengas que cerrar.
- Plan reconoce “All tasks complete” dentro de la agenda. Se conserva la confirmación del hábito vinculado, pero ya no abre otra celebración después.
- Las etiquetas accesibles de Plan aportan hora, prioridad, vínculo y estado. Se armoniza la semántica de los selectores.

V3 modifica tres archivos de interfaz respecto a v2. No añade dependencias, pantallas, reglas nuevas de racha ni otro formato de datos.

## Qué versión necesitas

Este ZIP es acumulativo: incluye los iconos v1 y las correcciones funcionales v2. Se puede aplicar sobre el ZIP original que enviaste, v1 o v2. No hace falta aplicar los tres parches por separado.

El aplicador verifica cada archivo antes de escribir. Si has editado un archivo desde la versión enviada, se detendrá: conserva tu trabajo e integra las diferencias con el diff adecuado. No hay opción de sobrescritura forzada.

## Aplicarlo manualmente en Replit

1. Guarda un checkpoint del código.
2. Sube y extrae `Chain-clarity-patch-v3.zip` en la raíz que contiene `artifacts`.
3. Abre Shell en esa raíz y comprueba:

```bash
python3 Chain-clarity-patch-v3/aplicar.py --check
```

4. Si todo coincide, aplica:

```bash
python3 Chain-clarity-patch-v3/aplicar.py --apply
```

El aplicador crea una carpeta `chain-code-backup-FECHA` con el código sustituido. Si falla la copia del lote, restaura los archivos ya cambiados. Si el parche ya está aplicado, no repite los cambios. Puedes añadir `--project /ruta/a/la/raiz` si Shell está en otra carpeta.

También puedes copiar los archivos completos de `reemplazar` a sus rutas. Si tu editor abre directamente `artifacts/chain`, omite ese prefijo. Integra manualmente cualquier archivo con cambios tuyos en vez de reemplazarlo entero.

Para Git, elige SOLO un diff según tu base:

| Base actual | Diff |
|---|---|
| ZIP original | `desde-original.patch` |
| Iconos v1 | `despues-de-iconos-v1.patch` |
| Estabilidad v2 | `despues-de-estabilidad-v2.patch` |

Ejecuta primero `git apply --check RUTA_DEL_DIFF` desde la raíz; después `git apply RUTA_DEL_DIFF`. No apliques todos los diffs.

## Si todavía no has aplicado v2

Las correcciones incluidas son Minimum → Done con un toque, coherencia de objetivos semanales entre superficies, protección ante siete descansos, Freeze diario, Repeat duradero y unidades de hitos correctas.

**Lee `NOTAS-REPEAT-V2.md` antes de usarlo.** V2 migra Plan a un formato que conserva reglas repetidas. Revisa y vuelve a guardar los días de Repeat que quieras mantener: no se activan automáticamente reglas históricas ambiguas. Las claves anteriores se conservan, pero no quedan sincronizadas con las nuevas.

Un checkpoint del código de Replit no copia los datos de Expo Go en el iPhone. Después de registrar trabajo con v2 o v3, volver a v1 o al código original puede mostrar datos antiguos. V3 y v2 comparten formato; volver de v3 a v2 solo revierte estos ajustes de interfaz.

## Verificar en tu entorno

Desde `artifacts/chain`:

```bash
pnpm run typecheck
pnpm test
```

Recarga Expo Go y comprueba:

- Abre una Chain diaria y una semanal: encuentra primero la acción de hoy, el resumen y el historial.
- Abre/cierra Progress y Chain settings. Edita color, días de descanso y mínimo; revisa la corrección del historial.
- Registra Minimum y conviértelo a Done; deshaz y comprueba Freeze diario y la meta semanal.
- Registra un día extra después de cumplir el objetivo semanal: aparece reconocimiento breve en la tarjeta; no tienes que cerrar un modal.
- Termina la última tarea, vinculada y no vinculada. En la vinculada, prueba tanto confirmar como Not yet. El hábito nunca se completa solo por terminar la tarea.
- Deshaz la última tarea: el reconocimiento de agenda terminada desaparece. Prepare tomorrow conserva su comportamiento.
- Revisa textos de Progress con pocos datos y con sesiones de foco. Deben hablar de registros.
- Comprueba texto grande, Reduce Motion y VoiceOver en iPhone. Los ajustes plegados deben anunciar su estado y las tareas su contexto.

Las pruebas automatizadas de dominio no verifican la distribución visual ni VoiceOver. El ZIP original no trae el monorepo completo o las dependencias necesarias para hacer aquí el typecheck de Expo. Los detalles de la validación realizada están en `VALIDACION.md`.

## Alcance siguiente

La portabilidad de datos (exportar/importar/borrar) queda pendiente como trabajo separado, porque afecta a datos y recordatorios. También siguen pendientes la implementación nativa real de Gate y el recorrido de compra. Este parche no los habilita.

## Cambios específicos de v3

- `artifacts/chain/app/(tabs)/plan.tsx`
- `artifacts/chain/app/chain/[id].tsx`
- `artifacts/chain/components/ChainCard.tsx`
