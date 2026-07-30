---
title: No solo un scan verde
description: Conectar npm audit, CodeQL y axe-core a un panel propio con historial y dedup — para que un análisis de seguridad y accesibilidad cuente una historia, no solo un checkmark que nadie mira dos veces.
date: 2026-07-17
tags: [seguridad, accesibilidad, sast, testing, ci-cd]
---

Un scanner de seguridad que corre en CI y no reporta a ninguna parte es ruido decorativo: aparece verde en un badge, nadie lo abre, y el día que encuentra algo real se pierde entre cien notificaciones de GitHub que también se ignoran. Lo que hace valioso un análisis automático no es que exista — es que alguien pueda mirarlo seis meses después y ver la historia completa: esto se encontró, esto se arregló, esto se aceptó a conciencia.

Así que en vez de dejar que `npm audit` y axe-core vivan y mueran dentro de un job de CI, los conecté al mismo panel que ya usaba para el pipeline y los experimentos de chaos: una tabla con estado, un endpoint de ingesta, una página con historial. La pieza nueva es pequeña — un `fingerprint` estable por hallazgo y un ciclo de vida de tres estados — pero cambia completamente lo que se puede contar sobre la seguridad del sitio.

## Identidad, no solo detección

El problema de correr un scan en cada push es que el mismo hallazgo aparece una y otra vez. Sin una noción de identidad, "17 vulnerabilidades encontradas" no dice si son las mismas 17 de ayer o si aparecieron 5 nuevas. La solución es un fingerprint — hash de la fuente, la regla y la ruta afectada — que identifica un hallazgo *a través* de corridas, deliberadamente sin incluir la severidad ni el título: si `npm` sube el rating de una vulnerabilidad de medio a alto, sigue siendo el mismo problema, no uno nuevo que duplica al anterior.

Con esa identidad estable, el ciclo de vida se vuelve honesto: un hallazgo nace `open`, alguien lo marca `resolved` cuando lo arregla o `accepted` cuando decide asumir el riesgo — con una nota de por qué. Reingerir un hallazgo que ya está resuelto no lo reabre solo; si el scan lo vuelve a ver, probablemente es porque el fix aún no llegó a producción, y reabrir automáticamente sería más ruido, no menos.

## Ejecutarlo de verdad cambia lo que encuentras

Escribir el parser de `npm audit --json` y probarlo con un JSON de ejemplo se siente como terminado. No lo está. Al correr el scanner de axe-core contra las páginas reales, la librería falló de inmediato: exige un `browser.newContext()` explícito, algo que ningún ejemplo de la documentación deja claro y que ningún test con datos de mentira habría revelado. El bug simétrico apareció en la ingesta: el endpoint leía el token de autorización de `process.env`, que en el servidor de desarrollo de Astro simplemente no existe — el resto del código del sitio usa `import.meta.env` para esto, y esa inconsistencia produjo un 401 silencioso que ningún test unitario iba a atrapar, porque los tests unitarios no arrancan un servidor de verdad.

Y cuando por fin todo corrió: **9 violaciones de contraste reales**, en ocho páginas públicas del propio sitio. No fixtures, no datos de prueba — texto con relación de contraste de 2.4 y 2.95 contra el mínimo de 4.5 que exige WCAG AA, en clases de color que llevaban ahí desde que se escribió el CSS. `npm audit` encontró 15 paquetes con vulnerabilidades reportadas, 8 de severidad alta o crítica. Ningún dato inventado hubiera sido tan convincente como encontrar los problemas de verdad, en el propio sitio, corriendo la herramienta contra sí misma.

## La regla que se repite

Cada módulo de este laboratorio termina reaprovechando el que ya existe: el escáner de accesibilidad corre sobre las mismas ocho páginas y el mismo bloqueo de recursos externos que ya tenían los tests end-to-end; la ingesta amplía el mismo endpoint que ya usaba el pipeline de CI; la página admin sigue el mismo patrón de fetch-y-repinta que las otras del panel LAB. Ninguna pieza se construyó desde cero. La disciplina no es escribir más código — es notar cuándo el código que ya existe casi resuelve el problema nuevo, y estirarlo en vez de duplicarlo.
