---
title: Unos proveedores te cobran, otros te cortan
description: "Al pasarse de una cuota solo pueden pasar dos cosas, y cuestan cosas distintas: dinero o el sitio caído. Por qué mi simulador de costos de infraestructura las pinta de colores distintos."
date: 2026-09-15
tags: [costos, infraestructura, turso, vercel]
lang: es
translationOf: some-providers-bill-you-others-cut-you-off
---

"¿Cuánto cuesta mantener esto al mes?" tiene una respuesta aburrida y una útil. La aburrida es sumar lo que pagas por cada plan. La útil responde a otra pregunta: qué pasa el mes que el tráfico se dispara, y qué se rompe primero cuando pasa.

Yo aprendí la diferencia dos veces, y las dos por la misma vía.

## Lo que factura no siempre es lo que crees

En julio de 2026 la gráfica de latencia de mi página de status pedía su serie cada 30 segundos. La consulta no tenía el índice compuesto que necesitaba, así que cada carga escaneaba la tabla entera de sondeos: con 62.000 filas, **una sola consulta se comió el 93% de mi cuota mensual de lecturas**. En agosto volvió a pasar por otro camino: una prueba de carga golpeó el sitio sin el caché del CDN por delante y agotó la cuota del todo.

La lección no fue "vigila el gasto". Fue que Turso no factura gigabytes ni peticiones: factura **filas escaneadas**, que no es lo mismo que filas devueltas. Una consulta que devuelve diez filas después de mirar doscientas mil te cuesta doscientas mil. Esa dimensión no aparece en ningún presupuesto que hagas de cabeza, y es la que me tumbó dos veces.

De ahí salió la página que uso ahora: un simulador del costo de mi infraestructura básica, dimensión por dimensión, con escenarios de crecimiento.

## Dos comportamientos, no uno

Cuando el uso se pasa de la cuota incluida solo pueden pasar dos cosas, y confundirlas es lo que hace inútil el número final de una hoja de cálculo:

- **Excedente**: el proveedor te cobra por unidad de más. Cuesta dinero, y el dinero se puede presupuestar.
- **Tope duro**: el proveedor no te cobra nada, te limita. Cuesta el servicio caído hasta que alguien se entera.

Un plan gratuito nunca te cobra de más. Te corta. Por eso en mi panel un excedente y un tope duro salen en colores distintos, la celda dice "se corta" en vez de una cifra, y el resumen lleva un contador aparte de cuotas rotas junto al total en dólares. Un total que suma cero cuando en realidad significa "esto no funciona" es peor que no tener total.

Hay una tercera forma que conviene no confundir con una cuota: el crédito de uso. El plan de pago de mi proveedor de hosting cuesta veinte dólares al mes **que incluyen veinte dólares de consumo**, y eso no es lo mismo que veinte dólares de infraestructura regalada: no hay cuota por recurso, el crédito se gasta en lo que sea que consumas y a partir de ahí se factura desde la primera unidad. Yo lo modelé mal la primera vez, como si el plan incluyera una cuota generosa de transferencia, y el simulador regalaba un terabyte que no existe. La diferencia solo se ve leyendo la página de precios con cuidado, que es exactamente el trabajo que esta página existe para no repetir cada vez.

De ahí sale también la recomendación de plan. El simulador no propone el plan más barato: propone **el más barato que no choca contra un tope duro**. Un gratis que se te queda corto no cuesta cero, cuesta una caída.

## Las mismas tarifas con las que facturo

Este sistema ya medía el consumo de cómputo por proyecto para poder cobrárselo a cada cliente, con las tarifas versionadas por fecha de vigencia. El simulador no copió esos números: los importa del mismo módulo.

Parece un detalle de organización y no lo es. Si el simulador tuviera su propia aritmética, yo cotizaría con un número y facturaría con otro, y la diferencia solo se vería el día que un cliente reclame una factura. Que las dos cosas no puedan divergir vale más que lo que costó cablearlas.

La misma disciplina aplica al proveedor que no factura por consumo. El correo se paga por asiento, no por uso, y entra en el modelo como cuota incluida cero con precio por unidad, en vez de con una rama especial en el cálculo. Una excepción escrita para un solo proveedor es justo la que nadie vuelve a probar.

## Lo que el simulador no sabe

Las cuotas y las tarifas están cargadas a mano, y cada tarjeta enseña la fecha en que se contrastaron contra la página de precios del proveedor. No es decoración: los tres cambian condiciones sin avisar, y un simulador desactualizado no falla con un error, miente con confianza. La fecha visible es lo que convierte "este número está mal" en algo que se puede notar de un vistazo.

Los escenarios tampoco son predicciones. Son tres puntos de una curva, editables celda por celda, y existen para responder una única pregunta: **cuánto tiene que crecer esto para que se rompa, y por dónde.** Saber eso antes de que pase es la diferencia entre subir de plan un martes por la tarde y descubrir el límite un sábado, con el sitio de un cliente caído y la cuota agotada hasta fin de mes.
