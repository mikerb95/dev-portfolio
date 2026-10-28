# 01 · Visión y contexto

## Qué es codebymike.net

Un **solo sistema** que cumple cuatro funciones a la vez:

1. **Portafolio público** de Mike (CodeByMike): quién es, qué hace, qué vende.
2. **Panel de control privado** (`/admin`) con el que opera su negocio de
   desarrollo independiente: clientes, proyectos, cobros, costos, P&L, bóveda de
   credenciales, seguimiento comercial, cotizaciones, marketing.
3. **Portal de clientes** (`/portal`) donde cada cliente ve sus facturas,
   documentos, avance por hitos y habla con Mike.
4. **Laboratorio de ingeniería** (`/lab`, `/status`, `/security`,
   `/engineering`, `/docs`) donde cada práctica que el portafolio afirma
   (monitoreo, seguridad, CI/CD, chaos, pruebas) existe de verdad, con datos
   reales y verificables por un tercero.

La idea que lo organiza todo, tomada del
[planteamiento del problema](../planteamiento-del-problema.md):

> ¿Cómo construir un solo sistema en el que la herramienta que opera el negocio
> sea, al mismo tiempo, la prueba pública y comprobable de la capacidad técnica
> de quien lo construyó, sin depender de servicios de pago para lo que da esa
> prueba?

Por eso casi todo es **desarrollo propio** sobre capas gratuitas: el monitor de
uptime, las alertas, los SLOs, el micro-SIEM, los motores de diagramas UML/BPMN.
El único servicio de pago "de negocio" es la pasarela Wompi (y la API de Claude
para las funciones de IA, con topes de gasto diario).

## Quién es Mike

- **Mike Rodríguez** (alias **CodeByMike**, GitHub `@mikerb95`). Apellido
  Rodríguez; nunca "Restrepo" (error que ya se cometió y corrigió una vez).
- Ingeniero de software independiente en **Colombia**, trabajo remoto e híbrido.
- Aprendiz del **SENA** (programa de Análisis y Desarrollo de Software, ficha
  3114731). Este repositorio es también su proyecto formativo: de ahí la
  documentación formal en `/docs` (requisitos, casos de uso, UML, BPMN, V&V,
  plan de pruebas, RACI) y el sistema de presentación para la **sustentación**.
- En oct 2026 está en **etapa productiva** SENA, lo que explica la página
  `/ep` y el vigía de la agenda del instructor.
- Dato citable: #3 en Colombia por contribuciones públicas en GitHub
  (committers.top, jul 2026).
- Contacto público: el sitio, WhatsApp (botón flotante) y LinkedIn. El buzón
  `mike@codebymike.net` **todavía no existe** (falta pagar Google Workspace);
  las alertas van a otro buzón configurado por variable de entorno.

## Modelo de negocio (lo que vende el sitio)

Todo precio sale de [`src/data/tarifario.ts`](../../src/data/tarifario.ts), que
es la única fuente para la web y para los cotizadores con IA. COP y USD son
**tarifas independientes**, nunca una conversión.

| Línea | Precio (oct 2026) | Página |
|---|---|---|
| Hora de trabajo | $70.000 COP / US$30 | (cotizadores) |
| Página web "Presencia" | desde $650.000 COP / US$250 | `/paginas-web` |
| Página web "Negocio" | desde $1.500.000 COP / US$500 | `/paginas-web` |
| "A medida" (software) | desde $4.500.000 COP / US$1.500 | `/paginas-web` |
| Capacitación en IA (8 h, hasta 20 personas) | $1.000.000 COP + $40.000 por persona adicional | `/capacitacion-ia` (el precio vive en `training_programs`) |
| Mantenimiento | sin precio fijo, se cotiza en horas al mes | - |
| Consultoría en logística/comercio exterior | por encargo, con PIN | `/cotiza` (privado) |

Reglas comerciales: 50 % antes y 50 % al entregar; redondeo hacia arriba a
$50.000 / US$50; cotización válida 15 días; colchón fijo del 20 % sobre las
horas de software a la medida; descuentos solo los decide Mike.

Clientes reales mencionados en el código y la vitrina de `/paginas-web`:
Toledo, DobleYo y Gorillaz (los tres con el medidor de cómputo instalado).

## Las tres caras del sitio

```
                     codebymike.net
        ┌──────────────────┼───────────────────┐
   PÚBLICO              PRIVADO              CLIENTES
   /, /tools, /lab,     /admin/*             /portal/*
   /status, /security,  /cobrar, /remote/*   /propuesta/<token>
   /notes, /docs, /en   /cotiza (PIN)        /acuerdo/<token>
   /paginas-web, /demo                       /c/<code>, /mis-pagos
```

- **Público**: marca técnica y comercial, en español (canónico) e inglés
  (`/en`). Páginas con *motion* propio (GSAP, WebGL, canvas) que muestran la
  práctica en vez de describirla.
- **Privado**: un único administrador (Mike), GitHub OAuth + allowlist o llave
  de seguridad (WebAuthn).
- **Clientes**: cuentas propias con email+contraseña, totalmente separadas del
  admin, más enlaces firmados para propuestas, acuerdos y cobros.

## Principios que se repiten en todo el código

1. **Evidencia sobre afirmación.** Si una página pública dice "monitoreo", hay
   un monitor real detrás y la página muestra sus datos (agregados).
2. **Fail-open en seguridad y observabilidad**, salvo la revocación de sesiones
   admin, que falla cerrada a propósito. Ver [08](08-seguridad-micro-siem.md).
3. **Integraciones opcionales que degradan en silencio**: sin su variable de
   entorno, una integración hace no-op y el sitio sigue.
4. **Lógica pura separada de la BD**: casi todo `src/lib` se prueba sin base.
5. **Una sola fuente de verdad por dato**: tarifario, requisitos, menú del
   panel, rutas traducidas, catálogo de automatizaciones.
6. **Migraciones solo aditivas.**
7. **El identificador de cliente nunca viene del request.**
8. **Coste de lectura acotado**: Turso factura filas escaneadas; ninguna página
   pública agrega tablas crudas en ventanas de más de 24 h.

## Fuera de alcance (decisiones explícitas)

- Multiusuario con roles en el panel (hay un solo administrador).
- App móvil nativa.
- Servicios de monitoreo/APM de pago.
- Contenerizar el runtime de producción (Docker es solo para desarrollo y
  pruebas; producción es Vercel).
- Migraciones destructivas de esquema.
