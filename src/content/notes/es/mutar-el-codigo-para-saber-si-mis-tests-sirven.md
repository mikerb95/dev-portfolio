---
title: Mutar mi código para saber si mis tests sirven de verdad
description: Cobertura dice qué líneas se ejecutaron. Mutation testing pregunta algo más incómodo — si rompo esta línea a propósito, ¿algún test se entera? Y contratos con Zod, para que un endpoint no cambie de forma sin que nadie se dé cuenta.
date: 2026-07-17
tags: [testing, calidad, ci-cd]
---

Este sitio tiene más de 400 tests y una cobertura que se ve bien en cualquier badge. Durante mucho tiempo eso me bastó como prueba de que la suite era sólida. Pero cobertura mide una pregunta muy limitada: ¿esta línea se ejecutó al menos una vez durante los tests? Un `if` que se ejecuta pero cuya condición nunca importa para el resultado cuenta como "cubierto" exactamente igual que uno que de verdad se está verificando. Cobertura alta con aserciones débiles es un número que miente con la conciencia tranquila.

La pregunta que de verdad me interesaba era otra: si alguien —yo, en un refactor apurado, o un colaborador que no conoce el porqué de una línea— rompe algo a propósito, ¿algún test se entera? Esa es la pregunta que responde el mutation testing, y es una técnica que casi nadie a nivel junior o intermedio conoce, lo cual la hace un argumento de conversación mejor de lo que su fama sugiere.

## Cómo funciona, en una frase

Stryker toma mi código, genera cientos de variantes ligeramente rotas —invierte un `>` por un `<`, cambia un `&&` por un `||`, borra una negación— y corre la suite completa contra cada una. Si algún test falla, el mutante murió: mis tests lo atraparon. Si la suite sigue pasando en verde con la línea rota, el mutante sobrevivió: tengo una línea de código que puedo romper sin que nadie se entere, que es la definición exacta de una prueba que no prueba nada.

El resultado, corriendo sobre `src/lib/**` —donde vive toda la lógica pura: pagos, P&L, clasificación de amenazas, SLOs— fue un **mutation score real de 87.2%**, no un número inventado para el artículo. Con el umbral configurado en Stryker (`high: 80, low: 60, break: 50`), eso cae en la banda buena.

## El reporte de Stryker no trae el número que necesito

Un detalle que no esperaba: el JSON que produce Stryker no incluye un score agregado. Trae, por archivo, la lista de mutantes con su estado individual —`Killed`, `Survived`, `NoCoverage`, `Timeout`, `Ignored`, `CompileError`—, y calcular el porcentaje es responsabilidad de quien consume el reporte. Escribí esa función aislada de red y disco (`computeMutationScore`, en `src/lib/lab/mutation.ts`) precisamente para poder testearla igual que cualquier otra lógica pura del repo: le doy un reporte de mentira con mutantes en cada estado y verifico que el cálculo excluye lo que no debe contar.

La decisión que más importa ahí es cuáles estados cuentan como "detectado" y cuáles no. `Ignored` y `CompileError` se excluyen del total —una mutación fuera de alcance o inválida no dice nada sobre la calidad de mis tests—, el mismo criterio que usa Stryker internamente. Pero `NoCoverage` **sí** cuenta como no detectado, y ahí está el punto entero del ejercicio: una línea que ningún test toca es exactamente el agujero que esta técnica existe para encontrar. Si la excluyera del cálculo, un módulo sin tests obtendría un score perfecto por omisión — 87.2% con esa línea presente en el conteo es un número que puedo defender; sin ella, sería una mentira más elaborada que la que estaba tratando de evitar.

## Un exit code que no es la verdad completa

Stryker sale con código distinto de cero cuando el score cae bajo el umbral `break`. La tentación obvia en el script que orquesta todo esto (`scripts/mutation-scan.mjs`) era dejar que ese exit code decidiera si el job de CI falla. No lo hice: el script sigue de largo, lee el reporte JSON de todas formas, calcula el score real, y lo reporta al panel — incluso si Stryker "falló". Un mutation score de 45% no es un error de infraestructura que deba tumbar el pipeline en silencio; es información que quiero ver en el panel para decidir qué hacer con ella. Tratar un score bajo como un fallo binario de CI es esconder exactamente el dato que este ejercicio existe para exponer.

## Lento a propósito, nunca en cada push

Mutar cada línea de `src/lib` y correr la suite completa contra cada mutante es, por diseño, muchísimo más caro que correr los tests una vez. El workflow (`mutation.yml`) corre manual (`workflow_dispatch`) o semanal (domingos, cuando nadie está esperando un PR), nunca en cada push — bloquear una fusión con un job de 90 minutos sería optimizar la métrica equivocada. La velocidad de iteración del día a día la protege la suite normal; el mutation score es una auditoría periódica de qué tan honesta es esa suite, no una puerta de entrada.

## Contratos: la otra mitad del remate

La pregunta de mutation testing es "¿mis tests detectan un bug?". La de contract testing es distinta: "¿la forma de mi respuesta cambió sin que nadie lo haya decidido a propósito?". Front y API viven en el mismo repositorio Astro, así que herramientas como Pact —pensadas para verificar contratos entre repos separados, consumidor y proveedor— eran sobredimensionadas para lo que necesitaba. La versión honesta fue más simple: esquemas Zod que describen el *shape* exacto de la respuesta de cuatro endpoints clave (`/api/health`, `/api/payments/checkout`, `/api/status/latency`, `/api/admin/lab/slo`), y un test por endpoint que llama al handler real y valida la respuesta real contra ese esquema.

El test que más me convence de que esto no es teatro es el último del archivo: toma una respuesta real de `/api/health`, renombra el campo `ok` a `healthy` —el tipo de cambio que alguien haría sin pensar dos veces en un refactor— y confirma que el esquema lo rechaza. Un test de contrato que nunca se ha visto fallar es indistinguible de uno que no prueba nada; este demuestra activamente que sí detecta la ruptura que existe para atrapar.

## Lo que este remate deja claro

Cobertura, mutation score y contratos responden tres preguntas distintas que suenan parecidas: ¿se ejecutó?, ¿si lo rompo, alguien se entera?, ¿la forma sigue siendo la que prometí? Ninguna sustituye a las otras. Un archivo con 100% de cobertura y 40% de mutation score tiene tests que ejecutan código sin verificar nada; un endpoint con lógica perfectamente probada puede seguir rompiendo a un consumidor si cambia de forma sin que ningún test se dé cuenta. Las tres capas juntas son, hasta ahora, la respuesta más honesta que he podido dar a la pregunta "¿cómo sé que mis tests sirven?" — y es una pregunta que vale más que el badge verde que la mayoría de proyectos se conforma con mostrar.
