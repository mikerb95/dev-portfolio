---
title: Una vitrina de seguridad no puede mentir, ni por accidente
description: Rediseñé la página de seguridad de este sitio para que mostrara la defensa en vez de describirla. Lo más útil no fue la animación, sino las cinco cosas que la página decía sin que fueran ciertas.
date: 2026-09-26
tags: [seguridad, opsec, turso, motion]
lang: es
translationOf: a-security-showcase-cannot-lie-even-by-accident
---

La [página de seguridad](/security) de este sitio se titula "Seguridad, con evidencia". Desde julio fue un titular, un párrafo y casi veinte tarjetas iguales: cifras del [micro-SIEM](/notes/construyendo-un-micro-siem-para-mi-portfolio), cuatro hallazgos de una auditoría y una lista de controles. Todo lo que decía era verdad, pero nada lo demostraba. Las cuatro capas de defensa, por ejemplo, eran una lista numerada.

Me propuse rediseñarla para que cada sección enseñara lo que afirma. Lo que no esperaba es que, al tener que dibujar cada afirmación, iban a aparecer las que no se sostenían.

## Qué es dato y qué es ilustración

La pieza central es un filtro: puntos que cruzan de izquierda a derecha las capas de defensa y terminan donde el sistema los dejaría de verdad. Un punto hostil se frena en el clasificador si su categoría es una reincidencia o un abuso del límite de tasa, queda atrapado si toca un señuelo, y en cualquier otro caso cae a la bitácora. El destino no lo decide la animación, lo decide la misma regla que describe al sistema:

```ts
export function destinoDe(categoria: string) {
  if (categoria === CATEGORIA_SENUELO) return 'senuelo'
  if (CATEGORIAS_FRENADAS.includes(categoria)) return 'frenada'
  return 'registrada'
}
```

El primer problema fue de honestidad, no de diseño. El reparto entre tipos de ataque es real: sale de los agregados de treinta días que la página ya publicaba. Pero ¿cuántos puntos limpios dibujo por cada hostil? El sitio no cuenta las visitas limpias, así que no lo sé. Podía inventar una proporción y dejar que pareciera un dato, o decirlo. La proporción es una constante en el código y la pieza lleva un pie que dice exactamente eso: el reparto entre categorías es real y la cantidad de tráfico limpio es ilustrativa.

Lo mismo con la primera capa, la mitigación de la plataforma. Existe, pero su trabajo ocurre fuera de este sitio y no la mido desde aquí. En el filtro se dibuja punteada y sin cifra, y ningún punto se frena en ella. Una capa que atrapara puntos sin datos detrás habría sido una afirmación disfrazada de gráfico.

Hay dos decisiones más que salen de la misma regla. Antes del clasificador todos los puntos son grises, porque una petición hostil no se distingue de una limpia hasta que alguien la inspecciona. Y hay un punto marcado "tú" que cruza limpio hasta el sitio. Eso sí puedo afirmarlo sin medir nada: si estás leyendo la página, ninguna capa te detuvo.

## Lo que la página decía sin querer

Al revisar cada cifra para decidir cómo animarla, salieron cinco cosas que no eran ciertas o no del todo.

**Un objetivo entre medidas.** La cuarta tarjeta del panel decía "Overhead p99 ≤5ms", al lado de los eventos detectados y los bloqueos automáticos. Esas dos cifras son medidas; esta no. Es un objetivo de diseño que nadie mide en producción. La quité del panel y sigue en la lista de SLO, que se presenta como lista de objetivos.

**Un rótulo más ambicioso que su cifra.** "Categorías OWASP" contaba todas las categorías del clasificador, incluidas las reincidencias, los bots, los señuelos y el abuso de API, que no son categorías de OWASP. Ahora dice "Categorías detectadas", que es lo que cuenta.

**Un tope que escondía justo lo interesante.** El desglose por categoría tenía un límite de ocho filas, y hay diez categorías posibles. La que quedaba fuera casi siempre era el señuelo, la más pequeña y la única señal sin ambigüedad del sistema. Me di cuenta porque el filtro, que reparte ese mismo desglose, mostraba "0 atrapados" en la base de prueba, que sí tenía eventos de señuelo. Subir el tope no lee ni una fila más: el escaneo es el mismo y solo cambia el corte.

**Una promesa desactualizada.** La metodología decía que la página se actualizaba con cada auditoría, pero solo listaba la de julio. La de septiembre, sobre el panel, cerró nueve hallazgos que no aparecían en ningún lado.

**Un detalle en la metodología.** Decía que cada hallazgo se corrigió "en un commit dedicado". Al enlazar los de septiembre resultó que no: dos commits cierran dos hallazgos cada uno, y uno de los traslados de endpoints ocurrió en un commit cuyo título habla de otra cosa. Enlazo el commit real y el texto lo dice, en vez de fingir un historial más ordenado del que hay.

Ninguna de las cinco era grave por separado. Juntas, en una página que se llama "con evidencia", sí lo eran.

## Los hallazgos, como una historia de commits

Los hallazgos corregidos se muestran como una línea de commits. Al bajar, cuando la línea alcanza un commit, su hallazgo pasa de "vulnerable" a "corregido": el problema se tacha, aparece la corrección y el hash se enciende. El servidor pinta todo ya corregido, porque es el estado real, y el script solo vuelve a abrir lo que todavía no se ve. Sin JavaScript o con movimiento reducido no hay nada que abrir.

Pasar de cuatro a trece hallazgos introdujo un riesgo que antes no existía. El texto de cada uno vive en el diccionario de idiomas y sus metadatos (commit, fecha, clasificación) en un módulo aparte, y se unen por posición. Un hallazgo añadido en un lado y no en el otro no rompe nada visible: corre todos los commits un puesto, y cada tarjeta pasa a enlazar la corrección de otra. Es el tipo de error que ningún visitante nota y que desmiente toda la página. Un test fija que las longitudes coincidan en los dos idiomas.

Solo se publica lo corregido. Lo que una auditoría deja pendiente a propósito no aparece hasta que se cierra, y nada de lo publicado sirve de manual: ni rutas señuelo, ni nombres de reglas, ni identificadores de cuenta.

## Evidencia que no cueste la cuota

La animación no añadió ni una consulta: el filtro reparte los mismos agregados que ya estaban. Pero al revisarlos apareció el problema de fondo. Cada visita sumaba treinta días de eventos crudos en cinco consultas, y Turso factura filas escaneadas, no consultas. Es el mismo patrón que ya me agotó la cuota de lecturas más de una vez, y la caché del CDN no lo acota, porque revalida por región.

Ahora los agregados se calculan como mucho una vez cada tres horas y se guardan como una foto en una fila de configuración. Cada visita lee esa fila, o nada si la instancia ya la tiene en memoria. Si recalcular falla, se sirve la foto anterior en vez de publicar ceros, y la página dice de cuándo es: "Calculado hace 2 horas". Una cifra vieja que dice su edad sigue siendo evidencia. Una cifra vieja que aparenta ser de ahora, no.

## Lo que me llevo

Una vitrina de seguridad tiene dos lectores con intereses opuestos. El que evalúa el trabajo quiere ver que el sistema existe y funciona. El que busca un hueco quiere el manual. La regla de no dar el manual ya la tenía. La que me faltaba era la otra mitad: cada cifra tiene que decir exactamente lo que cuenta, cada ilustración tiene que decir que lo es, y lo que no se mide no se dibuja como si se midiera.
