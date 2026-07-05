---
title: SLOs y error budgets para proyectos pequeños
description: El uptime en porcentaje engaña. Adaptar la disciplina SRE de Google — SLI, SLO, presupuesto de error y burn rate — a un portfolio de proyectos chicos.
date: 2026-07-05
tags: [sre, slo, observabilidad]
---

"99.2% de uptime este mes" suena bien hasta que haces la cuenta: son casi seis horas caído. ¿Eso es aceptable? ¿Es una crisis? El porcentaje solo no lo dice. La disciplina SRE de Google resolvió esto hace años con tres conceptos que casi nadie aplica fuera de las empresas grandes, y que funcionan igual de bien en un portfolio de proyectos pequeños.

## Los tres números

**SLI (indicador)**: la disponibilidad *observada*. En mi caso, checks exitosos sobre checks totales en una ventana de 30 días. Es un hecho, no una meta.

**SLO (objetivo)**: la disponibilidad *prometida*. Yo uso 99.5%. Decidirlo obliga a una conversación honesta: 100% no existe, y prometer 99.99% en proyectos que corren en planes gratuitos sería mentir.

**Error budget (presupuesto de error)**: la consecuencia aritmética del SLO. Si prometo 99.5% en 30 días, tengo derecho a ~3.6 horas de caída en esa ventana. Ese tiempo es un *presupuesto*: se puede gastar en deploys arriesgados, en migraciones, en no levantarse de madrugada por un blip de 2 minutos.

El cambio mental es este: **el objetivo deja de ser "cero caídas" (imposible) y pasa a ser "no agotar el presupuesto" (medible)**.

## Burn rate: la métrica que avisa a tiempo

El presupuesto restante dice dónde estás; el **burn rate** dice hacia dónde vas. Es la tasa de fallo observada dividida por la tasa que el presupuesto permite:

- burn rate **1.0** — gastas exactamente al ritmo sostenible: el presupuesto se agota justo al final de la ventana.
- burn rate **> 1** — vas camino a incumplir el SLO antes de que cierre la ventana.
- burn rate **14** — lo que parecía "un servicio algo inestable" es en realidad un incendio.

Un burn rate alto con presupuesto todavía disponible es la señal más valiosa del sistema: te avisa *antes* de incumplir, cuando aún puedes actuar.

## La implementación cabe en un archivo

Todo el cálculo — SLI, minutos de presupuesto, consumo, burn rate — son funciones puras sobre una lista de checks `(fecha, ok)`. Sin dependencias, con sus tests unitarios aparte. Los casos borde importan más de lo que parece: ¿qué pasa con un objetivo de 100% (presupuesto cero)? ¿Con una ventana sin datos? Decidirlos explícitamente en el código evita que la página de status muestre un `NaN%` un mal día.

Para la [página pública de status](/status) el cálculo no materializa cada check: la base de datos agrega por día (`GROUP BY`) y las mismas funciones operan sobre los conteos. Misma matemática, ~700 filas en vez de ~200.000.

## Por qué molestarse en proyectos chicos

Porque el presupuesto de error convierte la conversación con un cliente de "perdón, se cayó" a "usamos 40 minutos de las 3.6 horas que el acuerdo permite este mes, y esto fue lo que pasó". La primera frase es una disculpa; la segunda es ingeniería. La diferencia entre ambas no es el tamaño del proyecto — es la disciplina de quien lo opera.
