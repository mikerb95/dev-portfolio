---
title: Medir el aprendizaje en vez de declararlo
description: Un checkbox marcado en enero no distingue entre practicar cuarenta minutos diarios y haber abierto el tema una tarde. Construí un tracker que mide el hábito, y las tres decisiones que lo hacen correcto son de fechas, no de UI.
date: 2026-08-09
tags: [aprendizaje, arquitectura, testing]
lang: es
translationOf: measuring-learning-instead-of-declaring-it
---

Decidí especializarme en .NET y C#. La razón es prosaica: el backend empresarial en Colombia (banca, salud, sector público) corre sobre C#, y un portafolio que solo habla TypeScript abre la mitad de las puertas. Lo interesante no es esa decisión, sino lo que descubrí al ir a registrarla en mi propio panel.

Ya tenía dos sitios donde debería haber encajado. `/admin/certifications` lleva el inventario de cursos y certificaciones, con estado y fecha. El Evolution Path lleva rutas de labs con un checkbox por cada uno. Puse la intención en el primero, marqué un par de casillas en el segundo, y me quedé mirando la pantalla con la sensación de no haber registrado absolutamente nada.

El problema es que las dos herramientas responden **"qué hice"**, y la pregunta que importa cuando querés aprender un stack nuevo mientras trabajás en otro es **"cuánto tiempo llevo invirtiendo de verdad, y el hábito se está sosteniendo"**. Un checkbox marcado en enero no distingue entre alguien que practica cuarenta minutos diarios y alguien que abrió el tema una tarde y no volvió. Las dos cosas se ven idénticas: una casilla azul.

Así que construí una tercera cosa. Y lo interesante es que las decisiones difíciles no estuvieron en el tablero, sino en cómo se guarda una fecha.

## Lo único que se persiste es la sesión

El modelo entero se apoya en una idea: **la sesión de práctica es el único hecho**. Día, minutos, tema y qué entendí. Todo lo demás (racha, horas acumuladas, avance contra la meta semanal, mapa de calor, porcentaje del temario, logros) se calcula a partir de eso.

Esto no es minimalismo por gusto. Cada cifra derivada que decidís persistir es una cifra que puede quedar desincronizada de los datos que la produjeron. Y ese caso no es hipotético: te equivocás al registrar una sesión, la borrás, y ahora tenés un contador de horas que incluye una sesión que ya no existe.

Del mismo modo, el temario del track (28 hitos en 8 áreas, de fundamentos de C# a desplegar una API real) sí vive en base de datos, porque quiero editarlo desde el panel a medida que descubra que un área estaba mal partida. Pero la plantilla con la que se siembra vive en código, y la siembra es idempotente por título: volver a dispararla añade los hitos nuevos de la plantilla sin duplicar ni pisar el estado de los que ya cerré.

## La decisión que casi rompe la racha antes de existir

El servidor corre en UTC. Yo estudio de noche, después del trabajo.

Cuando registro una sesión a las 8 de la noche en Colombia, en UTC ya es la 1 de la madrugada del **día siguiente**. Si guardo la sesión como un instante y luego calculo la racha agrupando por día en UTC, esa sesión cuenta para mañana. El resultado: practico todos los días de la semana y el tablero me muestra la racha rota, porque cada sesión aterriza un día más allá del día en que ocurrió.

Un tracker motivacional que castiga por practicar tarde es estrictamente peor que no tener tracker.

La solución fue dejar de guardar instantes. `skill_sessions.day` es un texto con formato `YYYY-MM-DD`, resuelto una sola vez en zona `America/Bogota` al momento de registrar:

```ts
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRACKER_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
})

export function dayKeyOf(date: Date = new Date()): DayKey {
  return dayFormatter.format(date)
}
```

Y a partir de ahí, toda la aritmética es de calendario sobre esas claves, nunca sobre relojes. Sumar un día es sumar un día, sin horas de por medio que puedan desplazarse.

Lo que me convenció de que esto era lo correcto y no un rodeo: **una racha es un hecho del calendario, no del reloj**. Guardar el instante obliga a reinterpretar la zona horaria en cada consulta, en cada test y en cada gráfico. Guardar el día no obliga a nada. El test que fija esto es de una línea y dice todo:

```ts
// 8 de la noche en Bogotá ya es el día siguiente en UTC.
expect(dayKeyOf(new Date('2026-08-09T01:30:00Z'))).toBe('2026-08-08')
```

## Un día de gracia, porque la alternativa es cruel

La segunda decisión fue cuándo se rompe una racha.

La implementación obvia (si no hay sesión hoy, la racha es cero) produce esto: abrís el panel un martes a las nueve de la mañana y ves tu racha de doce días en cero, porque todavía no estudiaste en un día que lleva nueve horas de existir. Es técnicamente cierto y motivacionalmente desastroso.

La racha se mantiene viva si la última sesión fue **ayer**, y solo se corta a los dos días. Pero mantenerla viva en silencio tampoco sirve, así que el cálculo devuelve un campo aparte:

```ts
return {
  current,
  record: Math.max(record, current),
  lastActive,
  activeToday: gap === 0,
  atRisk: current > 0 && gap === 1,
}
```

`atRisk` es lo que alimenta el mensaje de cabecera del tablero. Si ya practiqué hoy, dice cuántos días llevo. Si la racha está viva pero hoy todavía no hay nada, dice que está en juego. Y si se rompió hace rato, no finge: dice cuántos días pasaron y cuál fue el récord, que es la única forma honesta de invitar a empezar de nuevo.

Ese campo booleano hace más por el hábito que el resto del tablero junto.

## Los logros se calculan, y por eso son honestos

Diez logros: la primera sesión, rachas de 7 y 30 días, la primera semana cumpliendo la meta, umbrales de 10, 50 y 100 horas, y tres del temario.

No hay tabla de badges desbloqueados. Se recalculan en cada render sobre las sesiones y los hitos que la página ya cargó.

La razón es la misma de antes llevada al extremo. Una tabla de logros obliga a escribir en cada `POST` de sesión, con la lógica de "¿este insert desbloqueó algo?" duplicada dentro del endpoint. Y se corrompe en cuanto borrás una sesión mal registrada: te quedan badges concedidos por datos que ya no existen. Recalcular sobre datos que ya están en memoria cuesta nada y no puede mentir.

La parte que no es trivial es el fechado. Un logro tiene que decir **el día en que se cumplió**, no el día en que abrí el panel. Para los umbrales de horas eso significa recorrer las sesiones en orden y ver en cuál cruzó la suma acumulada:

```ts
let acc = 0
for (const s of sorted) {
  const before = acc
  acc += s.minutes
  for (const h of hourThresholds) {
    if (before < h * 60 && acc >= h * 60) crossedOn.set(h, s.day)
  }
}
```

Y para las rachas, el día que cerró la primera secuencia de N días consecutivos, que puede haber sido hace tres meses. Son 31 tests sobre esta lógica, y buena parte de ellos existe justamente para fijar esas fechas: cambio de mes, año bisiesto, fin de año, y que el logro de racha de 7 se feche el día que se completó y no hoy.

## Multi-track desde el día uno, con un solo track

El modelo no sabe nada de .NET. Hay una tabla `skill_tracks`, y .NET es una fila con su temario asociado. Añadir Rust o Azure es sembrar otra fila.

Me lo cuestioné mientras lo escribía, porque generalizar para un caso hipotético es una de las formas más comunes de complicar código sin ganar nada. Pero el coste real fue un `trackId` en dos tablas y un selector en la cabecera, y la alternativa (`dotnet_sessions`, `dotnet_milestones`, `/admin/dotnet`) garantizaba un copy-paste completo la primera vez que apareciera una segunda tecnología. Cuando la generalidad cuesta un campo, se paga.

## Lo público es solo el agregado

El tracker es privado. Pero un track se puede marcar como público, y entonces `/certifications` muestra tres números: horas acumuladas, porcentaje del temario y mejor racha.

La bitácora no sale nunca. Ni las fechas de cada sesión, ni el estado de cada hito. Es la misma regla que aplico en `/status`, donde lo público son agregados y nada más, por razones que allá son de OPSEC y acá son simplemente que el detalle de mi práctica no le interesa a nadie y a mí me condiciona lo que escribo. Un campo de bitácora que sé que va a ser público deja de ser una bitácora y pasa a ser una publicación.

Y un track sembrado sin sesiones se filtra antes de llegar a la página. Cero horas y cero por ciento no dicen nada bueno de nadie.

## Lo que me llevo

Esperaba que la parte difícil de un tracker fuera el tablero: el mapa de calor, las barras, los colores. Resultó ser lo más rápido.

Lo que costó pensar fue lo invisible. Que una fecha sin hora es un tipo de dato distinto de una fecha con hora, y confundirlos rompe la única métrica que le importa al usuario. Que un cálculo derivado no debería persistirse salvo que puedas pagar el coste de que se desincronice. Y que la diferencia entre una herramienta que usás y una que abandonás en dos semanas puede estar en un campo booleano que decide si el mensaje de arriba dice "llevás doce días" o "tu racha está en juego".

El próximo paso es que ese mensaje llegue solo, por notificación, cuando la racha esté en riesgo y queden pocas horas del día. La infraestructura ya está: notificaciones opcionales que hacen no-op silencioso si falta la configuración, y crons que ya corren. No hace falta nada nuevo, que suele ser la señal de que la decisión anterior estaba bien tomada.
