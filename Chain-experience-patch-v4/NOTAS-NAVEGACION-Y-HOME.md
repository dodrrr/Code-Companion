# Navegación y sugerencia de mínimo

## Home

`MINIMUM_SUGGESTION_HOUR = 18` está en `app/(tabs)/index.tsx`. Usa la hora local del dispositivo. Antes de las 18:00 la tarjeta lleva a la Chain y propone hacer espacio para la versión completa; desde las 18:00 ofrece el mínimo como alternativa si sigue habiendo un compromiso pendiente.

`useLocalClock()` actualiza al cambiar el minuto y al recuperar primer plano. Si la app queda abierta, no hace falta cambiar de pestaña para cruzar el umbral; al llegar medianoche vuelve al comportamiento normal. En segundo plano se cancela el temporizador hasta reactivar. No se programa una notificación ni se cambia el horario del hábito.

El mínimo sigue accesible en el detalle como acción secundaria todo el día. No se interpreta el nombre de una Chain como una regla horaria: “No phone after 10pm” no define por sí solo una hora de vencimiento. El umbral 18:00 es una decisión de producto ajustable en esa constante, no una afirmación de que sea el mejor momento para todos.

## Navegación

El stack utiliza la animación predeterminada nativa y presentación `card`. Las rutas Chain, Rhythm, Gate insights, Gate windows, ajustes, creación y paywall heredan la misma transición horizontal. No se simula volver desplazando la vista y ejecutando después un salto con JavaScript.

Se ha retirado el gesto manual horizontal del calendario, que podía competir con el gesto de volver. Sus flechas de mes permanecen. La lectura del resumen Plan de Home se aplaza hasta después de las interacciones para reducir trabajo durante el retorno.

Con la versión declarada de react-native-screens, iOS 26 admite el reconocedor nativo de volver desde el contenido. En versiones anteriores se usa el borde izquierdo para conservar la transición del sistema. No se fuerza el gesto personalizado a toda la pantalla que requiere otra animación. Reduce Motion desactiva la animación del stack.

**Excepción de Focus:** entra y sale con la transición del stack, pero el gesto de volver queda desactivado. Su botón de salida pausa y guarda el temporizador antes de cerrar. Un pop interactivo sin esa coordinación saltaría el guardado asíncrono. Onboarding mantiene su recorrido sin gesto de regreso.

Las hojas de edición continúan desplegándose desde abajo, como Task details. El cambio de pestaña no se convierte en una navegación de detalle. La interacción real necesita validación en iPhone; este trabajo modifica su configuración y retira conflictos, pero no certifica su fluidez en hardware.

Fuentes oficiales consultadas:

- React Native Screens, guía para autores de librerías: https://github.com/software-mansion/react-native-screens/blob/main/guides/GUIDE_FOR_LIBRARY_AUTHORS.md
- Expo Router, Stack: https://docs.expo.dev/router/advanced/stack/
- Expo, código nativo personalizado: https://docs.expo.dev/workflow/customizing/
