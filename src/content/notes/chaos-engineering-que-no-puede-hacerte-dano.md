---
title: Chaos engineering que no puede hacerte daño
description: Inyectar fallos en producción para probar que las alertas funcionan — con fail-open, TTL obligatorio y un botón de pánico, para que el caos jamás se convierta en un incidente real.
date: 2026-07-05
tags: [chaos-engineering, resiliencia, sre]
---

¿Cómo sabes que tu monitoreo detecta una caída si nunca has visto una? Confiar en alertas que jamás se han disparado es fe, no ingeniería. La única forma de saber que la cadena completa funciona — el monitor detecta, el incidente se registra, la push llega al móvil — es romper algo a propósito y mirar.

Eso es chaos engineering. Y la razón por la que suena a locura ("¿inyectar errores 500 en producción?") es que la mayoría imagina la versión sin frenos. La parte interesante del diseño no es inyectar fallos: es garantizar que **el experimento no pueda convertirse en el desastre que intenta prevenir**.

## Tres frenos, todos en el diseño

**Fail-open.** El motor de caos se consulta en cada request, y cualquier cosa puede fallar: la base de datos no responde, un flag está corrupto, el código lanza. La regla es absoluta: si el motor de caos falla, el request pasa limpio. El peor comportamiento posible del sistema de caos es no hacer nada — nunca amplificar el problema.

**TTL obligatorio.** Ningún flag de caos vive más de 15 minutos, y el límite está en el código, no en la disciplina de quien lo usa. El escenario que esto elimina: activas latencia extra para un experimento, te interrumpe una llamada, te olvidas — y el sitio queda degradado para siempre. Con TTL, el olvido cuesta como máximo 15 minutos.

**Rutas intocables.** El panel de administración y la autenticación están excluidos por código, no por configuración. Pase lo que pase, siempre puedes entrar y pulsar el botón de **pánico** que apaga todos los flags de golpe. Un sistema de inyección de fallos que puede bloquear su propio interruptor de apagado es una trampa que se cierra sola.

## Qué se puede inyectar

Tres tipos de fallo, activables por ruta desde el panel:

- **Latencia extra** — ¿el umbral de degradación del monitor realmente salta?
- **Error 500** — ¿la caída se detecta, se agrupa en un incidente y llega la alerta?
- **Servicio muerto** — la versión dura: ¿cuánto tarda todo el pipeline de detección de punta a punta?

El experimento más valioso que he corrido no fue ninguno de esos: fue matar la base de datos *a mitad de una transacción* y verificar que el rollback dejara los datos consistentes. Es la clase de pregunta que nadie responde hasta que la producción la hace por sorpresa.

## El costo real: casi cero

Sin flags activos, el motor cuesta una lectura cacheada cada pocos segundos por instancia — nada. No hay agentes, no hay infraestructura aparte: es middleware del mismo sitio, una tabla con TTL y una página en el panel.

El retorno es difícil de exagerar. La primera vez que activé un `error500` y a los pocos minutos vibró el móvil con la alerta de caída — y al apagarlo llegó la de recuperación — dejé de *creer* que mi monitoreo funcionaba. Lo había visto. Esa diferencia, entre creer y haber visto, es exactamente lo que un cliente compra cuando contrata a alguien que opera con esta disciplina.
