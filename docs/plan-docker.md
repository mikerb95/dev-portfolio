# Plan: Docker como infraestructura de desarrollo y verificación

> Estado: **Fases 1 y 2 implementadas** (31 jul 2026). Fases 3-5 pendientes.

## Premisa

Docker **no** es el runtime de producción de este proyecto y no debe llegar a
serlo. El sitio lo construye y ejecuta Vercel (SSR sobre Fluid Compute);
contenerizar la app Astro para desplegarla perdería edge, preview deploys por PR
y el rollback automático de `ci.yml`, a cambio de nada.

Lo que sí aporta —y es donde está el uso profesional serio de contenedores hoy—
es todo lo que rodea al despliegue: **entorno reproducible, infraestructura de
pruebas fiel, herramientas aisladas y cadena de suministro verificable**.

Saber dónde *no* aplicar la herramienta es parte del entregable.

## Fase 1 — Entorno reproducible ✅

`.devcontainer/` define el entorno como código: Node 22.12 fijo, Chromium de
Playwright preinstalado, Docker CLI y `gh` disponibles.

Resuelve un fallo real y documentado en `CLAUDE.md`: el shell por defecto puede
traer Node 20 y eso rompe `astro build`. Con el devcontainer esa clase entera de
fallo desaparece, y la imagen es la misma que puede usar CI, así que la paridad
dev/CI deja de ser aproximada.

Verificado: la imagen construye y contiene Node v22.12.0 exacto, usuario no-root
(uid 1000) y `chromium-1228`.

**Decisión:** imágenes pineadas por **digest**, no por tag. Una reproducibilidad
que depende de que nadie mueva `latest` no es reproducibilidad.

## Fase 2 — libSQL real en pruebas ✅

`compose.yaml` levanta dos servidores `sqld` (principal y demo, instancias
distintas igual que en producción).

```bash
npm run db:up      # levanta y espera a que respondan
npm run db:seed    # siembra ambas con datos ficticios
npm run db:reset   # borra volúmenes y vuelve a empezar
npm run test:e2e:server   # e2e contra los contenedores
```

Turso habla HTTP/hrana, no filesystem. Los tests que dependen de transacciones,
UNIQUE y concurrencia —pagos y aislamiento del portal, justo donde un falso
verde sale caro— solo son fieles contra el mismo protocolo que corre en prod.

Verificado: las migraciones de Drizzle y `seed-demo.mjs` corren **sin un solo
cambio de código** contra sqld en contenedor (51 tablas migradas, 4320 checks
sembrados por HTTP).

**Decisión:** el modo por archivo sigue siendo el predeterminado
(`E2E_DB_MODE=server` activa el otro). Obligar a levantar contenedores para
correr los e2e sería cambiar un test que funciona por uno que además hay que
administrar. CI no cambia.

### Hallazgos que cambiaron el diseño

1. **Capacidades mínimas medidas, no supuestas.** Con `cap_drop: ALL`, sqld
   moría en bucle. El mínimo real resultó ser `DAC_OVERRIDE` + `CHOWN` +
   `SETUID` + `SETGID`: su wrapper crea el directorio de datos en un volumen
   ajeno, se adueña de él y baja privilegios antes de arrancar. `FOWNER` no
   hace falta. La alternativa —devolver el `ALL` al primer fallo— es como los
   contenedores acaban corriendo con todo abierto.

2. **Una sonda mal escrita afirma menos de lo que parece.** La primera medición
   dio por buena una capacidad de menos porque buscaba el texto
   `Permission denied` en los logs, y el fallo real decía
   `Operation not permitted`. El criterio correcto no era buscar un string
   concreto en un log, sino comprobar que el servidor contestara. Vale como
   caso de estudio de testing: un aserto sobre un mensaje de error es un aserto
   sobre una cadena, no sobre el comportamiento.

3. **`astro dev` es singleton.** Con un servidor de desarrollo abierto en otra
   terminal, el `webServer` de Playwright no fallaba con "puerto ocupado": Astro
   imprimía "Dev server already running" y salía con código 0, y Playwright solo
   reportaba `Process from config.webServer exited early`, que no menciona el
   lock. Arreglado con `--ignore-lock`, más `ASTRO_DEV_BACKGROUND=0` para que el
   servidor corra en primer plano y Playwright pueda gestionar su ciclo de vida.
   Esto arregla los e2e locales en **ambos** modos, con o sin Docker.

4. **Lista blanca en el sembrador.** `seed-e2e.mjs` arrasa el esquema del
   destino antes de sembrarlo. Al admitir URLs `http://` además de `file:`,
   un error de configuración dejaba de degradar una prueba y pasaba a borrar
   una base. Se restringió a destinos locales enumerando lo permitido —falla
   cerrado— en vez de lo prohibido, que falla abierto en cuanto aparece un host
   que nadie previó.

### Material de sustentación

`/docs/docker` (fuente: `src/data/docker.ts`) es la versión para exponer en
clase: conceptos con su malentendido típico, anatomía archivo por archivo con su
porqué, decisiones defendibles, los hallazgos de abajo, ruta de estudio priorizada
y preguntas probables del jurado con respuesta preparada. Este plan es el registro
técnico; esa página es el guion.

## Fase 3 — Herramientas del LAB en contenedor (pendiente)

ZAP ya corre en contenedor sin que se note (`zaproxy/action-baseline` envuelve
una imagen). Formalizarlo en `lab/` con imágenes pineadas por digest da ZAP, k6,
Trivy y Lighthouse idénticos en local y en CI.

Desbloquea parcialmente la **Fase 5 del plan del LAB**: k6 está esperando
`VERCEL_TOKEN`, pero `grafana/k6` en Docker corre hoy contra un preview deploy
sin instalar nada y sin gastar minutos de CI. Es la "Opción A" de
`docs/plan-lab-fases-pendientes.md`, ya ejecutable.

## Fase 4 — Chaos real con Toxiproxy (pendiente)

Los chaos flags actuales solo simulan los fallos que el propio código decide
simular. Un Toxiproxy entre la app y el libSQL local inyecta latencia, cortes y
ancho de banda degradado **que el código no sabe que están ocurriendo**.

Es lo que valida de verdad la regla de *fail-open* del repo: hoy no se puede
comprobar si el sitio sigue en pie cuando el rate limiter tarda 5 s en
responder. Material para un artículo en `/notes`.

## Fase 5 — Cadena de suministro (pendiente)

Donde está el nivel más alto y donde casi nadie mira:

- SBOM por imagen con Syft.
- Escaneo con Trivy/Grype, ingestado a `/api/lab/ingest` igual que ya hacen
  `npm audit` y CodeQL en `/admin/lab/security`.
- Firma keyless con Cosign (OIDC de GitHub) y procedencia SLSA vía
  `actions/attest-build-provenance`.

## Pendiente de verificación

La suite e2e completa en modo servidor **no tiene aún una corrida limpia
comparable**: las mediciones se hicieron con el árbol de trabajo en edición
activa, y los fallos observados se movían entre corridas siguiendo los cambios
en `src/`, no el modo de base de datos. Hay que repetir
`npm run test:e2e` y `npm run test:e2e:server` sobre un árbol quieto y comparar.
