---
title: El precio pactado no se toca
description: Construí Cotiza, la herramienta con la que llevo mis encargos de consultoría en logística. El precio se fija al inicio y nunca se reabre; lo que llega después entra como adicional, con su precio y con la aprobación del cliente antes de hacerlo. La IA ayuda a contar, pero no a cobrar.
date: 2026-10-06
tags: [producto, ia, seguridad, arquitectura]
lang: es
translationOf: the-agreed-price-does-not-move
decision:
  problem: "Encargos que empezaban pequeños y terminaban en horas que nadie pagó."
  rejected: "Recalcular el precio al final según lo que se hizo"
  chosen: "Precio congelado, cupos contados y adicionales aprobados antes"
---

Antes del software trabajé ocho años en logística, comercio exterior, compras y operaciones, y todavía me buscan para eso. El problema nunca fue el trabajo. Fue el alcance. Un encargo empieza como "ayúdame con unas presentaciones y revísame unos documentos" y termina en reuniones de una hora que nadie pactó, mensajes a las diez de la noche y pedidos nuevos justificados con "eso lo hablamos".

Mi primera idea fue una calculadora que ajustara el precio final según lo que se hubiera hecho. La descarté rápido: cambiar el precio a mitad de camino es mala práctica, el cliente lo vive como una sorpresa y la discusión deja de ser sobre el trabajo para pasar a ser sobre la confianza. El precio tiene que quedar fijo al inicio. Lo que había que resolver era qué pasa con todo lo demás.

## Cinco reglas, y una herramienta que las hace cumplir

Ninguna de las reglas es nueva. Lo nuevo es no depender de mi disciplina para aplicarlas.

1. **Se cotizan entregables que se pueden contar.** No "ayuda con presentaciones", sino cuántas presentaciones, de cuántas diapositivas y con cuántos documentos de base.
2. **Lo incluido son cupos.** Un número de reuniones de cierta duración, un número de rondas de cambios por entregable, un horario de atención y un tiempo de respuesta. La herramienta los descuenta.
3. **Lo que no está escrito no está pactado.** Después de cada reunión sale un resumen escrito con un plazo para corregirlo. Si nadie lo corrige, vale lo escrito.
4. **El precio pactado no se toca.** Lo nuevo entra como adicional, con un precio que sale de la tarifa que ya estaba en la propuesta, y se aprueba antes de hacerlo.
5. **Fuera de horario cuesta más**, y ese recargo también está escrito desde el inicio.

Con esas reglas, la "calculadora" que yo quería al principio se convierte en otra cosa: no ajusta el precio, muestra tres cifras. El precio pactado, que no cambia; los adicionales aprobados; y lo que está por decidir.

## Un motor puro y una propuesta congelada

El cálculo vive en un módulo puro, sin base de datos, y es el mismo en el navegador y en el servidor. En el navegador da el precio en vivo mientras armo la propuesta. En el servidor, al congelarla, se recalcula desde la configuración y se guarda el resultado completo: las tarifas, los cupos y las reglas de ese día, con su huella SHA-256 sobre un JSON canónico. Lo que el navegador haya mostrado no cuenta. Si mañana cambio mis tarifas, un encargo aceptado la semana pasada sigue con las suyas, y sus adicionales también.

El plan de pagos no tiene cálculo propio: usa los mismos tramos por monto que ya usaba Plano, mi cotizador de software, con nombres de consultoría en lugar de "diseño" y "publicación". Dos herramientas con dos repartos distintos terminarían diciéndole cosas diferentes al mismo cliente.

La máquina de estados es corta a propósito: borrador, enviado, aceptado, cerrado. Reabrir existe solo antes de aceptar. Después no hay botón para "ajustar" una propuesta aceptada, porque esa es exactamente la mala práctica que la herramienta existe para evitar. Cada transición es un UPDATE condicional sobre el estado que se leyó, así que dos clics cruzados chocan en lugar de pisarse.

## La bitácora decide sola cuándo algo es adicional

Una vez aceptado el encargo, todo lo que pasa se anota, y la mitad de las decisiones las toma el código:

- Un pedido marcado como adicional nace con su precio. El recargo no es una casilla: lo decide la hora del pedido leída en hora de Bogotá, contando fines de semana y festivos. El servidor corre en UTC, y un mensaje de las siete y media de la noche aquí es la madrugada siguiente allá; sin esa conversión, un pedido fuera de horario parecería dentro.
- Una reunión que ya no cabe en los cupos, o que se pasa del tiempo pactado más unos minutos de gracia, nace como adicional en bloques de media hora. Los cupos se gastan en el orden en que se anotan, no por fecha: una reunión registrada tarde no le quita el cupo a otra que ya se dio por incluida.
- Una ronda de cambios de más pide las horas que yo estimo. No hay forma honesta de calcular sola cuánto cuesta "otro cambio".

Cada anotación y su adicional van en la misma transacción. Las pruebas corren contra una base libSQL creada con el SQL real de las migraciones, con el reloj fijo, porque un test que depende del día en que se corre es un test que algún día falla sin razón.

## El cliente aprueba con constancia

La propuesta le llega al cliente como un enlace privado. Ve lo que incluye y lo que no, sus cupos con lo que ya usó, el valor, los resúmenes de cada reunión y, arriba de todo, los adicionales por aprobar con una frase que hace casi todo el trabajo: no se empieza hasta que lo apruebes.

El token tiene 128 bits y en la base solo vive su huella, más una copia cifrada para poder volver a copiarlo desde el panel. Generar uno nuevo mata el anterior. La página es pública pero va sin caché y fuera de los buscadores, porque es un documento personal con precios.

Al aceptar, el cliente deja su nombre y su documento, y la página envía la huella de la propuesta que mostró. Si mientras la leía yo la cambié, no se acepta la versión vieja. En cada adicional, el monto va en el WHERE del UPDATE: se aprueba la cifra que el cliente vio o nada. Cada decisión deja una constancia SHA-256 que cualquiera puede recalcular con los datos guardados. Esa es la respuesta escrita a "yo nunca aprobé eso".

## La IA cuenta, pero no cobra

Hay tres puntos donde Claude ayuda: convertir el mensaje del cliente en un alcance contable con las preguntas que conviene hacer antes de cotizar, clasificar un pedido nuevo contra el alcance aceptado y ordenar mis notas de una reunión en un resumen. Las garantías están en el código, no en el prompt:

- **Ninguna cifra de dinero sale de la IA.** Los esquemas de salida no tienen dónde ponerla, y una guardia descarta cualquier texto con dinero que no estuviera en lo que yo pegué. La IA puede repetir el valor de un flete que mencionó el cliente; no puede inventar un precio. Los precios los pone el motor.
- **Las citas son literales.** Cada entregable lleva la frase del cliente que lo justifica, y el código la busca en el texto original. Si no aparece tal cual, se quita. Una cita inventada es peor que ninguna, porque se usa para decir "esto lo pediste tú".
- **Nada se anota solo.** El alcance entra al borrador, que reviso antes de congelar, y la clasificación y el resumen llenan formularios que confirmo con un clic.

Al clasificador le pedí algo explícito: ante la duda entre "dentro del alcance" y "adicional", si el pedido agrega cantidad o un tema nuevo, es adicional. Ser complaciente ahí es justo el hábito que quiero dejar.

## Una puerta más débil, con alcance de una sola habitación

Esta herramienta la uso donde está el cliente, a veces desde un equipo que no es el mío, así que la entrada no podía depender de GitHub ni de una llave física. Entra con un PIN corto. Una llave así de débil solo es aceptable por tres cosas: abre esta herramienta y nada más del panel (rutas comparadas con patrones anclados, para que una página nueva con nombre parecido no quede abierta por accidente), tiene un freno por IP y otro general que apaga la puerta si los fallos se acumulan desde muchas IP, y falla cerrada: si no se puede leer el PIN, no abre. Cada entrada me llega como aviso al teléfono. Cambiar el PIN invalida todas las sesiones abiertas con el anterior, porque la versión del PIN va dentro de la firma de la cookie.

## Lo que falta por saber

La IA está probada contra una API falsa con citas y cifras inventadas a propósito, y contra el modelo real con un pedido realista. La primera corrida real ya enseñó algo: propuso un supuesto que contradecía mis cupos, y ahora el prompt le prohíbe escribir sobre lo que la herramienta ya fija. Todavía no la he usado con pedidos de clientes reales. Y la tabla de horas por entregable es mi estimación de hoy; en unos meses, con encargos cerrados, sabré si las presentaciones me toman lo que creo. Lo que sí sé es que la próxima vez que alguien me diga "eso lo hablamos", va a haber algo escrito.
