---
title: El bloqueo que no era una credencial
description: Dos meses con la última fase del laboratorio esperando un secreto de Vercel que, al ponerlo, no abría ninguna puerta. La prueba de carga no necesitaba un permiso, necesitaba que alguien releyera su propio guardarraíl.
date: 2026-09-18
tags: [k6, load-testing, ci-cd, lab, postmortem]
lang: es
translationOf: the-blocker-that-was-never-a-credential
---

Durante dos meses, cada lista de pendientes de este proyecto empezaba con la misma línea: falta `VERCEL_TOKEN` en los secretos de GitHub. Debajo, la consecuencia: sin él, el rollback automático solo avisa en vez de revertir, y la Fase 5 del laboratorio (las pruebas de carga con k6) no tiene un entorno de preview contra el que correr.

La primera mitad era cierta. La segunda no, y nadie lo comprobó porque el pendiente se copiaba de lista en lista sin volver a verificarse. Cuando por fin cargué el token, el rollback quedó habilitado en cinco minutos y las pruebas de carga siguieron exactamente igual de bloqueadas. La credencial no abría ninguna puerta, porque la puerta que el plan describía no existía.

## Lo que decía el plan

El diseño original era razonable: la carga nunca corre contra producción (Vercel factura por invocación y CPU activa, Turso tiene cuota de filas leídas, y mil usuarios sintéticos se parecen mucho a un ataque), así que se corre contra un preview deployment desechable. Para pedirle a Vercel esa URL hace falta un token. De ahí la dependencia.

Entre que se escribió ese plan y el momento de implementarlo pasó algo: en agosto, una corrida de k6 contra `localhost` agotó la cuota de lecturas de la base real. El servidor local estaba levantado con un `.env` que apuntaba a la Turso de producción, y una de cada cuatro peticiones de la mezcla iba a `/status`, que agrega noventa días de sondeos en cada render. La URL era local; la base, no.

La respuesta a ese incidente fue un guardarraíl de dos mitades en el perfil compartido de los scripts:

```js
export function exigirBaseLocal(base) {
  const res = http.get(`${base}/api/health`, { timeout: '10s' })
  // ...
  if (salud?.checks?.db?.local !== true) {
    exec.test.abort(`El objetivo ${base} está conectado a una base REMOTA.`)
  }
}
```

La primera mitad mira la URL del objetivo y rechaza los dominios de producción. La segunda, la que de verdad hacía falta, pregunta a qué base está conectado ese objetivo antes de levantar un solo usuario virtual.

## La contradicción que nadie leyó en voz alta

Un preview deployment de Vercel lee de Turso. Es lo que lo hace útil: es el sitio de verdad, con datos de verdad. Y es exactamente lo que el guardarraíl prohíbe.

Con el token puesto o sin él, la corrida contra un preview aborta en `setup()`, antes de la primera petición de carga. El bloqueo no era administrativo, era de diseño, y llevaba escrito dos meses en el propio repositorio: el plan pedía un objetivo que el código se negaba a aceptar. Las dos cosas eran correctas por separado. Nadie las leyó juntas.

Vale la pena detenerse en por qué la trampa funciona tan bien. Un pendiente atribuido a una credencial es cómodo: no exige pensar, solo esperar. Se copia de una lista a otra sin releer el motivo, y cada copia lo hace parecer más verificado de lo que está. Los pendientes que dependen de terceros merecen una relectura periódica precisamente porque nadie los discute.

## La salida estaba en la suite de e2e

Los tests end-to-end de este sitio llevaban meses resolviendo el mismo problema sin llamarlo así: levantan el sitio contra dos bases libSQL desechables que se siembran en el arranque del servidor de pruebas. Nada remoto, nada que cueste dinero, nada que dependa de un secreto.

El workflow de carga hace lo mismo. Instala dependencias, siembra las bases con el mismo script de los e2e, levanta el servidor en el propio runner, confirma contra `/api/health` que la base es local, y recién entonces suelta k6 contra ese `localhost`. Cuesta cero invocaciones, cero filas de Turso, y no necesita ningún token de Vercel.

Lo que se gana es que la prueba vuelve a ser posible. Lo que se pierde hay que decirlo con la misma claridad, y por eso está escrito en la cabecera del workflow: un runner de GitHub tiene dos vCPU compartidas, así que estos números caracterizan la aplicación (dónde está el cuello de botella, qué ruta es cara, cuánto tarda en recuperarse), no la infraestructura de Vercel. Los valores absolutos solo son comparables contra otras corridas del mismo tipo. Para eso sirve tener la serie en el panel en vez de una captura suelta.

## Tres copias de la misma regla

La regla de no correr contra producción vive ahora en tres sitios, cada uno donde el anterior ya no alcanza: el script (que valida URL y base), el workflow (que corta antes de gastar un minuto de runner) y la ingesta que recibe el resultado (que rechaza la fila si el objetivo era producción, por si alguien corre k6 a mano saltándose el script).

Esa última capa obligó a duplicar la lista de dominios prohibidos: el perfil de k6 corre en el runtime de k6, que no es Node y no puede importar TypeScript. Duplicar una regla de seguridad es cómo se abren los agujeros silenciosos, así que la copia no se sostiene sola. Un test lee el archivo `.js`, extrae la lista con una expresión regular y la compara con la del módulo TypeScript:

```ts
const perfil = readFileSync('lab/k6/lib/perfil.js', 'utf8')
const enScript = [...linea[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
expect(enScript.sort()).toEqual([...OBJETIVOS_PROHIBIDOS].sort())
```

Relajar una copia sin la otra deja de ser un descuido invisible y pasa a ser un test rojo.

## Qué mide, ahora que corre

Los escenarios ya existían y habían corrido de verdad desde agosto; lo que faltaba era que su evidencia dejara de vivir en archivos JSON dentro del repositorio. La escalera de carga busca la capacidad sostenida midiendo solo en meseta, nunca el agregado de rampa más meseta, que promedia un nivel sano con uno saturado y no describe ninguno de los dos. El escenario de estrés busca otras dos cosas: el punto de quiebre y cuánto tarda el sistema en volver.

Esa tercera pregunta es la que más cuesta responder bien. La recuperación no es un número, es una curva: el promedio de toda la fase mezcla el sistema todavía drenando con el ya recuperado. Se mide por tramos, y el panel distingue "volvió en 75 segundos" de "no volvió", que podrían imprimirse parecido y significan lo contrario. Un tramo sin peticiones tampoco cuenta como recuperación: su percentil es cero por falta de muestra, no por salud, y leerlo como sistema sano sería el mismo error que el propio endpoint de muestreo cometió al saturarse y reportar CPU al 0% en vez de "sin dato".

## Lo que me llevo

El hallazgo técnico de la fase no fue ninguna cifra de latencia. Fue que un pendiente puede sobrevivir dos meses siendo falso si su causa suena lo bastante burocrática. "Falta un permiso" no invita a investigar. "El objetivo que pide el plan es incompatible con el guardarraíl que escribí después" sí, pero esa frase no aparece sola: hay que ir a leer las dos piezas y notar que se contradicen.

Antes de dar algo por bloqueado en una credencial, conviene comprobar que el camino que esa credencial abre existe siquiera. A veces el permiso llega, la puerta se abre, y del otro lado hay una pared.
