# V3 · Reconocimiento sin interrupciones en Chains

Archivo modificado: `artifacts/chain/components/ChainCard.tsx`.

## Cambios

- Al registrar un día por encima del objetivo semanal, la etiqueta de la tarjeta muestra `ANOTHER DAY KEPT` durante cuatro segundos. Después recupera la racha semanal. El contador `+N` y el progreso de la semana siguen visibles; no se añade altura ni se desplazan otras tarjetas.
- Se elimina el modal que pedía `Continue` por cada día extra. El mensaje no tiene acciones obligatorias, animaciones ni bloqueo de la navegación.
- El reconocimiento aparece después de que `toggleToday` confirme el guardado. Un error lo limpia y mantiene el aviso de error existente. Cambiar `Minimum` a `Done` no cuenta como otro día extra.
- Se mantiene un único feedback háptico ligero al registrar y de selección al deshacer. No se añade una segunda vibración por el mensaje.
- La animación del check conserva su duración y su alternativa estática con Reduce Motion. Si Reduce Motion cambia durante la llegada del check, el icono recupera inmediatamente su opacidad completa.
- Se conservan los hitos de 7, 30 y 100. Un extra dentro de una semana cuya racha ya es 7, 30 o 100 no vuelve a abrir el hito: para el hito semanal la racha debe aumentar.
- No se modifican registros, recuentos, política de Freeze, estados accesibles del checkbox ni semántica de v2.

## Validación

La suite existente pasó: **108 pruebas, 108 aprobadas**. Verifica las reglas de datos existentes; no valida por sí sola el temporizador ni el renderizado nativo de esta pantalla. Se revisaron el diff y las dependencias: no hay librerías nuevas y se eliminan los imports y estilos del modal retirado.

Comprobar en Expo/iPhone antes de publicar:

1. Con objetivo 3/semana y tres días ya registrados, marcar hoy: aparece `ANOTHER DAY KEPT`, `4/3` y `+1`; se puede tocar otra tarjeta de inmediato; a los cuatro segundos vuelve la racha.
2. Deshacer: vuelve el estado anterior y desaparece el reconocimiento. Marcar de nuevo no duplica días.
3. Mejorar un día `Minimum` a `Done`: se cambia el icono, sin sumar otro día ni mostrar reconocimiento de extra.
4. Alcanzar por primera vez un hito semanal mantiene su celebración. Un día extra de esa misma semana no vuelve a mostrarla.
5. Activar Reduce Motion: el mensaje es estático y el check aparece sin escala. Comprobar VoiceOver y texto grande; la información permanente del progreso sigue en la etiqueta accesible de la tarjeta.
6. Simular un fallo de persistencia: se mantiene el aviso existente y no queda reconocimiento de extra.

No se ejecutaron un typecheck completo del monorepo, Expo Go ni pruebas sobre un dispositivo real en este entorno.
