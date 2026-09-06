# Chain — Experience v4

Parche preparado sobre **Chain clarity v3**, la versión que confirmaste haber aplicado. Incluye archivos completos modificados y nuevos, un diff y un aplicador con comprobación de versiones. No es un proyecto Replit completo.

## Qué vas a ver

| Área | Cambio |
| --- | --- |
| Chain settings | Hoja desde abajo inspirada en Task details, con Color, Schedule y Minimum version. Una opción abierta cada vez. |
| Colores | Paleta compartida de 18 colores; conserva los anteriores y añade siete. Disponible también al crear Chains y en los acentos de tareas. |
| Home | El botón destacado Log minimum aparece desde las 18:00 del dispositivo si hay un compromiso pendiente. Antes se invita a abrir la Chain y hacer la versión completa. |
| Detalle | El mínimo sigue accesible todo el día como acción secundaria. Historial, acciones y resumen semanal permanecen cerca. |
| Navegación | Transiciones del stack nativo para Chain, Rhythm, Gate insights y las demás rutas de detalle. Se retiran gestos del calendario que competían con volver. |
| Rhythm | Pantalla propia, periodos 7/28/90, consistencia, Done/Minimum/Freeze separados, horas de registro, Focus e hitos de racha conservados. |
| Gate insights | Intentos, elecciones de salir/continuar y pausas sin decisión, con desglose por app y periodos 7/28/90. En este build son ejemplos de preview. |
| Guardado | Registros de hábito con fecha/hora local; tarea y Focus guardados juntos; controles contra duplicados, corrupción y formatos futuros. |

La aplicación sigue en inglés. Las instrucciones de este paquete están en español.

## Antes de abrir v4

**Lee MIGRACION-Y-DATOS.md.** V4 actualiza el formato local de Chains y Plan. Un checkpoint de Replit guarda código; no copia los datos del iPhone. Una vez que v4 haya abierto y migrado esos datos, volver a v3 restaurando solo el código no es una reversión segura.

El parche no añade dependencias ni cambia el SDK de Expo. No conectes servicios nuevos para aplicarlo.

## Aplicarlo en Replit

1. Guarda un checkpoint del código y detén Run/Metro mientras sustituyes los archivos.
2. Sube y extrae `Chain-experience-patch-v4.zip` en la raíz del proyecto que contiene `artifacts`.
3. En Shell, desde esa raíz, comprueba:

```bash
python3 Chain-experience-patch-v4/aplicar.py --check
```

4. Si coincide con v3, aplica:

```bash
python3 Chain-experience-patch-v4/aplicar.py --apply
```

El aplicador verifica todos los archivos antes de escribir, crea `chain-code-backup-FECHA` y no pisa cambios que no reconozca. Si ya está aplicado, no lo duplica. Si Shell abre otra carpeta, usa `--project /ruta/a/la/raiz`.

Si informa de cambios distintos, no borres tus archivos para pasar la comprobación. Integra `despues-de-v3.patch` conservando tus cambios o envía el ZIP actual para adaptar el parche.

5. Desde `artifacts/chain`, usando el entorno existente del proyecto:

```bash
pnpm run typecheck
pnpm test
```

6. Inicia Run de nuevo y recarga Expo Go. Si no aparecen las rutas nuevas, reinicia Metro desde el flujo de Run que ya utilizas.

### Alternativas

- Copia los archivos de `reemplazar/artifacts/chain` a las mismas rutas de tu app. Si tu editor ya abre la carpeta de la app, omite `artifacts/chain`. Esta alternativa requiere integrar por tu cuenta cualquier cambio local.
- Con Git, desde la raíz: `git apply --check Chain-experience-patch-v4/despues-de-v3.patch`; después `git apply Chain-experience-patch-v4/despues-de-v3.patch`.

Elige un método. No es necesario aplicar el diff después del aplicador. Este paquete presupone v3; no es acumulativo desde el ZIP original.

## Qué está comprobado y qué falta

Las pruebas de lógica y almacenamiento pasan; consulta `VALIDACION.md`. No se ha podido compilar todo el monorepo Expo aquí ni probar las pantallas en un iPhone. La suavidad exacta del gesto, teclado, tamaños y VoiceOver deben comprobarse en tu dispositivo con `PRUEBA-EN-IPHONE.md`.

Gate no puede verificar todavía si permaneciste o saliste de otra app. Los botones de preview registran elecciones; no son distracciones evitadas ni minutos ahorrados. Para medir señales nativas reales hacen falta la integración de Screen Time y un development build. Expo Go no incorpora esa extensión mediante un parche JavaScript.

El historial sigue guardándose en el dispositivo. No se ha añadido sincronización en nube ni recuperación tras desinstalar. Una misma ocurrencia de tarea guarda una medición Focus; repetirla después de desmarcarla no añade otra sesión en esta versión.

## Lectura del paquete

- `MIGRACION-Y-DATOS.md`: formatos, preservación, reversión y límites.
- `NOTAS-AJUSTES.md`: hoja y edición de preferencias.
- `NOTAS-NAVEGACION-Y-HOME.md`: reloj local y gestos.
- `NOTAS-RHYTHM-DATOS.md` y `NOTAS-RHYTHM-UI.md`: definición de estadísticas, muestras e hitos.
- `NOTAS-GATE.md`: decisiones, procedencia y retención.
- `PRUEBA-EN-IPHONE.md`: recorrido manual corto.
- `VALIDACION.md`: pruebas realizadas y pendientes.

## Archivos de aplicación incluidos

- `artifacts/chain/app/(tabs)/gate.tsx`
- `artifacts/chain/app/(tabs)/index.tsx`
- `artifacts/chain/app/(tabs)/plan.tsx`
- `artifacts/chain/app/_layout.tsx`
- `artifacts/chain/app/chain/[id].tsx`
- `artifacts/chain/app/chain/new.tsx`
- `artifacts/chain/app/focus/[id].tsx`
- `artifacts/chain/app/gate-insights.tsx`
- `artifacts/chain/app/pause-gate-demo.tsx`
- `artifacts/chain/app/rhythm/[id].tsx`
- `artifacts/chain/app/settings.tsx`
- `artifacts/chain/constants/colors.ts`
- `artifacts/chain/context/ChainsContext.tsx`
- `artifacts/chain/context/PlanContext.tsx`
- `artifacts/chain/domain/chains.ts`
- `artifacts/chain/domain/gateStats.ts`
- `artifacts/chain/domain/plan.ts`
- `artifacts/chain/domain/rhythm.ts`
- `artifacts/chain/hooks/useLocalClock.ts`
- `artifacts/chain/lib/gateEventsRepository.ts`
- `artifacts/chain/lib/gateStats.ts`
- `artifacts/chain/lib/planRepository.ts`
- `artifacts/chain/lib/rhythmRepository.ts`
- `artifacts/chain/lib/rhythmStorage.ts`
- `artifacts/chain/tests/gate-stats-regressions.test.mjs`
- `artifacts/chain/tests/rhythm-data.test.mjs`
