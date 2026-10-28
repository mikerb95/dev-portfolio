# 21 · Documentos relacionados

## Planes vivos (`docs/plan-*.md`)

Se actualizan al implementar (fases ✅, decisiones nuevas); no se archivan.
Estado según la cabecera de cada uno a la fecha de esta foto (puede ir atrás
del código: verificar).

| Plan | Tema | Estado declarado |
|---|---|---|
| [plan-roadmap-2026-07](../plan-roadmap-2026-07.md) | Plan maestro: 11 etapas | Todas completas desde el 1 oct 2026 |
| [plan-security-observability](../plan-security-observability.md) | Micro-SIEM | Fases 0-6 implementadas |
| [plan-siem-multiproyecto](../plan-siem-multiproyecto.md) | Sensor portable e ingesta de terceros | Auditado, RF-609 a RF-611 planeados |
| [plan-analista-siem](../plan-analista-siem.md) | Analista de IA del SIEM | Fases 0-6 ✅ |
| [plan-lab](../plan-lab.md), [plan-lab-fases-pendientes](../plan-lab-fases-pendientes.md) | LAB SENA | Completo (fase 5 k6 el 18 sep) |
| [plan-implantacion](../plan-implantacion.md) | Implantación del módulo de load testing | Documento SENA |
| [plan-testing-docs](../plan-testing-docs.md) | `/docs/testing` | Implementado |
| [plan-documentacion](../plan-documentacion.md) | `/docs` | Fase 1 + entregas posteriores |
| [plan-docker](../plan-docker.md) | Docker de desarrollo | Fases 1-2; 3-5 pendientes |
| [plan-portal-clientes](../plan-portal-clientes.md) | Portal | Fases 0-7 |
| [plan-portal-tiempo-real](../plan-portal-tiempo-real.md) | Portal vivo | Fases A-C |
| [plan-cobrar](../plan-cobrar.md) | Cobros de campo | Implementado |
| [plan-cuentas-de-cobro](../plan-cuentas-de-cobro.md) | Cuentas de cobro | Fases 0-3 y 5 |
| [plan-plano](../plan-plano.md) | Plano | Implementado |
| [plan-cotiza](../plan-cotiza.md) | Cotiza | Fases 0-5 (la cabecera aún dice "planeado") |
| [plan-asistente](../plan-asistente.md) | Asistente, cotizador y asesor | Todas las fases |
| [plan-marketing](../plan-marketing.md) | Correos promocionales | Implementado; falta cron y prueba real |
| [plan-computo-clientes](../plan-computo-clientes.md) | Cómputo y cuota de Vercel | Implementado |
| [plan-automatizaciones](../plan-automatizaciones.md) | Catálogo de crons | Implementado |
| [plan-presentaciones](../plan-presentaciones.md) | Decks con PIN | Implementado |
| [plan-control-final](../plan-control-final.md) | Mando de `final.html` | Implementado |
| [plan-managed-agents](../plan-managed-agents.md) | Vigía del repo | Fases 1, 2 y 5 ✅; 3 pausada; 4 preparada |
| [plan-capacitacion](../plan-capacitacion.md) | Capacitación en IA | Fase 1; 2-5 pendientes |
| [plan-aprendizaje](../plan-aprendizaje.md) | Tracker de aprendizaje | Implementado |
| [plan-i18n-en](../plan-i18n-en.md) | Inglés | En implementación (casi todo hecho) |
| [plan-diseno-web](../plan-diseno-web.md) | `/paginas-web` | v1 implementada |
| [plan-oferta-principal](../plan-oferta-principal.md) | Definición de la oferta | Propuesta v1 (parte superada por las tarifas del 1 oct) |
| [plan-dominio-net](../plan-dominio-net.md) | Migración a `.net` | Código listo; pasos manuales en `pendientes.md` |
| [plan-og-images](../plan-og-images.md) | Imágenes OG | - |
| [plan-briefings](../plan-briefings.md) | Briefings | Solo fase 1 |
| [plan-platziconf](../plan-platziconf.md) | Landing Platzi Conf | La cabecera dice "plan" pero la página existe |

## Runbooks

- [runbook-cuota-turso](../runbook-cuota-turso.md): base bloqueada por cuota.
- [runbook-sustentacion](../runbook-sustentacion.md): día de la sustentación.

## Ingeniería de requisitos y calidad (SENA)

- [planteamiento-del-problema](../planteamiento-del-problema.md) (generado desde
  `src/data/planteamiento.ts`).
- [requisitos-funcionales](../requisitos-funcionales.md),
  [requisitos-no-funcionales](../requisitos-no-funcionales.md) (la fuente viva es
  `src/data/documentacion.ts`).
- [historias-de-usuario](../historias-de-usuario.md),
  [matriz-trazabilidad](../matriz-trazabilidad.md).
- [taller-testing-caja-negra](../taller-testing-caja-negra.md) con evidencias en
  `docs/evidencias-taller-testing/`.
- Documentos ofimáticos: DEA (raíz), plan de pruebas
  (`docs/plan-pruebas-codebymike.pdf`), plan de implantación
  (`docs/plan-implantacion-sena.docx`, `docs/PlanImplantacion.pptx`), manuales
  (`manuales_sena/`, `docs/manuales-sena/`), matriz (`docs/matriz-codebymike.xlsx`).
- Diagramas BPMN exportados: `docs/diagramas-bpmn/`.

## Otros documentos

| Archivo | Tema |
|---|---|
| [`pendientes.md`](../../pendientes.md) | Inventario vivo de acciones manuales y trabajo pendiente |
| [`seo.MD`](../../seo.MD) | Estado y plan de SEO |
| [`instrucciones-redes.md`](../../instrucciones-redes.md) | Distribución automática de notas a blogs y redes |
| [`tokenmaxim.md`](../../tokenmaxim.md) | Traspaso de `/present-admin` (sep 2026) |
| `docs/facebook/` | Kit de la página de Facebook (12 posts) |
| `docs/google-perfil/` | Perfil de Google del negocio |
| `docs/burn-rate/MAPA.md` | Mapa de burn rate |
| `docs/zoho.md` | Notas de Zoho |
| `docs/guion-meetup-analista.md` | Guion del meetup del analista (1 oct 2026) |
| `docs/propuesta-workshop-managed-agents.md` | Propuesta de workshop |
| `docs/hallazgos-presentacion.md` | Hallazgos de la presentación |

## Artículos técnicos (`/notes`)

24 artículos en `src/content/notes/{es,en}/`, uno por feature grande:

| Tema | Artículo |
|---|---|
| Monitoreo | por-que-construi-mi-propio-monitor |
| SLOs | slos-y-error-budgets-en-un-portfolio |
| Micro-SIEM | construyendo-un-micro-siem-para-mi-portfolio |
| Bloqueo escalado | bloqueo-escalado-de-ips-sin-desconectarme-a-mi-mismo |
| Vitrina de seguridad | una-vitrina-de-seguridad-no-puede-mentir-ni-por-accidente |
| Analista de IA | un-analista-que-propone-pero-no-decide |
| Sesiones | sesiones-revocables-sobre-jwt-stateless |
| Dos logins | dos-logins-en-el-mismo-sitio-y-ninguno-conoce-al-otro |
| Aislamiento del portal | el-client-id-nunca-viene-de-la-url |
| i18n seguro | traducir-un-sitio-sin-abrirle-una-puerta-trasera |
| Chaos | chaos-engineering-que-no-puede-hacerte-dano |
| E2E | e2e-que-prueban-lo-que-de-verdad-importa |
| Mutation | mutar-el-codigo-para-saber-si-mis-tests-sirven |
| SAST/a11y | no-solo-un-scan-verde |
| k6 | el-bloqueo-que-no-era-una-credencial |
| Site-check / SSRF | analizar-cualquier-dominio-sin-poner-en-riesgo-el-propio |
| Cobros | cobrar-un-trabajo-de-campo-sin-api-de-whatsapp |
| Plano | cotizar-con-un-rango-que-se-cierra |
| Cotiza | el-precio-pactado-no-se-toca |
| Asistente | un-asistente-que-escribe-con-permiso |
| AEO | que-un-asistente-te-recomiende-sin-inventarte-el-precio |
| Costos de infra | unos-proveedores-te-cobran-otros-te-cortan |
| Aprendizaje | medir-el-aprendizaje-en-vez-de-declararlo |
| RAG | rag-cuando-conviene-y-como-no-arruinarlo |

Pendiente según `pendientes.md`: un artículo sobre los correos promocionales.
