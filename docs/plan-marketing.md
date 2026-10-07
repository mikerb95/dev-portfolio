# Plan: correos promocionales (`/admin/marketing`)

Requisito **RF-225** en `src/data/documentacion.ts`. Iniciado y entregado el
6 oct 2026, el mismo día en que quedó configurado Resend en producción.

## Decisiones (6 oct 2026)

| Pregunta | Decisión | Por qué |
|---|---|---|
| ¿Se importan los clientes y contactos que ya existen? | **No.** La lista arranca vacía. | La Ley 1581 pide autorización previa y expresa para usar un correo con fines comerciales. Ninguna de las tablas existentes (clients, project_contacts, client_users, messages) la tiene. |
| ¿Motor propio o Broadcasts de Resend? | **Propio**, sobre la API de Resend que ya se usa. | El consentimiento es un dato legal y vive junto al resto de los datos personales, en Turso. Las estadísticas quedan en el panel. |

## Reglas que el código impone

- **Solo con consentimiento.** Tres entradas, todas opcionales y desmarcadas:
  `/novedades` y la casilla de `/contact` (con doble confirmación por correo,
  o cualquiera podría suscribir un correo ajeno) y la casilla de la cuenta del
  portal (sin doble confirmación: el correo ya lo verificó la invitación). Se
  guarda el texto exacto que aceptó cada persona.
- **Baja siempre.** Cada correo lleva su enlace firmado con HMAC
  (`MARKETING_SECRET`), que no caduca. Sin el secreto **no se dispara nada**:
  fallar cerrado aquí es a propósito, porque una promoción sin baja incumple
  la ley.
- **Horario de la Ley 2300 de 2023**: L-V 7:00-19:00, sábados 8:00-15:00,
  nunca domingos ni festivos (`lib/festivos-co.ts`), en hora de Colombia.
- **Una promoción por persona por semana.** Si alguien tiene pendientes dos
  campañas, la segunda espera sus 7 días.
- **Cupo diario** (`MARKETING_CUPO_DIARIO`, 50 por defecto). El plan gratis
  de Resend da unos 100 correos al día compartidos con el portal y las
  alertas, y una campaña no puede dejar a un cliente sin su enlace para
  restablecer la contraseña.

## Piezas

| Pieza | Dónde |
|---|---|
| Reglas puras (franja legal, semana, cupo, correo) | `src/lib/marketing/reglas.ts` |
| Contenido (validación, texto a HTML seguro) | `src/lib/marketing/contenido.ts`, también lo usa la vista previa en el navegador |
| Tokens de baja y confirmación | `src/lib/marketing/tokens.ts` (solo servidor) |
| Armado y envío por lotes (`/emails/batch`) | `src/lib/marketing/envio.ts` |
| Suscriptores, campañas, cola | `src/lib/marketing/db.ts` |
| Panel | `/admin/marketing` (resumen, campañas, suscriptores) y `/admin/marketing/[id]` (editor con vista previa) |
| Públicas | `/novedades`, `/novedades/baja`, `/api/marketing/{suscribir,confirmar,baja}` |
| Cron | `GET /api/cron/marketing-envio`, cada hora desde cron-job.org |
| Tablas | `marketing_suscriptores`, `marketing_campanas`, `marketing_envios` (migración 0047) |

### Cómo sale una campaña

1. Borrador → "Enviarme una prueba" (va a `ALERT_EMAIL_TO`, sin enlace de baja real).
2. "Disparar": encola un envío por cada suscriptor activo. El UNIQUE
   (campaña, suscriptor) hace que disparar dos veces no duplique a nadie.
   Desde ese momento la campaña ya no se edita.
3. La cola la vacían el cron y el botón "Enviar lo pendiente ahora", que
   aplican las mismas reglas. Cada lote se reclama con un `UPDATE` condicionado
   a `pendiente`, así que los dos a la vez no duplican.
4. Cada lote va a Resend con `Idempotency-Key` = id del lote. Si la función
   muere entre enviar y anotar, a los 10 minutos el lote se reintenta con la
   misma llave y Resend no lo duplica (guarda la llave 24 h). Un 5xx o un error
   de red se reintentan; un 4xx se marca fallido.
5. Sin nada pendiente, la campaña pasa a `enviada`.

## Fases

- ✅ **Fase 0, base:** esquema, migración 0047, reglas puras y tests.
- ✅ **Fase 1, suscripción:** `/novedades`, doble opt-in, casilla en `/contact`
  (es y en) y en la cuenta del portal, baja con página y botón.
- ✅ **Fase 2, panel:** resumen (activos, cupo, franja legal), lista de
  campañas con contadores (enviados, pendientes, fallidos, bajas atribuidas),
  suscriptores con baja manual, editor con vista previa en vivo y prueba.
- ✅ **Fase 3, cola:** lotes con idempotencia, cron horario, cancelación.
- [ ] **Cron en cron-job.org** (lo crea Mike): `GET https://codebymike.net/api/cron/marketing-envio`
      cada hora con `Authorization: Bearer <CRON_SECRET>`. Mientras no
      exista, las campañas solo salen con el botón del panel.

## Decisiones que surgieron al implementar

- **Sin "baja con un clic" de Gmail (RFC 8058).** El POST de Gmail llega como
  formulario, de otro origen y sin cabecera `Origin`, y el `checkOrigin` de
  Astro lo rechaza con 403 antes de llegar al endpoint. Apagarlo quitaría la
  protección CSRF de todo el sitio, y Gmail solo exige el un-clic a quien envía
  más de 5.000 correos al día. La cabecera `List-Unsubscribe` sí va, y apunta a
  la página de baja, de modo que Gmail y Outlook muestran su botón "Cancelar
  suscripción".
- **La página de baja no da de baja al abrirla.** Los escáneres de enlaces de
  los correos corporativos abren todo; un GET que diera de baja sacaría a gente
  que no lo pidió. La baja es un botón (POST).
- **Remitente aparte** (`novedades@codebymike.net`, configurable con
  `MARKETING_EMAIL_FROM`): una queja de spam contra una promoción no debe
  arrastrar la reputación de `portal@`. Las respuestas van a
  `PORTAL_EMAIL_REPLY_TO`.
- **Sin seguimiento de aperturas ni clics.** Es un píxel espía en el correo de
  la gente; con la lista pequeña, las respuestas y las bajas dicen más.
- **Formato pobre a propósito** (párrafos, `**negrita**`, `[enlace](https://…)`):
  no entra HTML del editor, todo se escapa y solo se generan esas etiquetas.
  Solo se aceptan enlaces `https`.
- **Rastro en el micro-SIEM** con la categoría `marketing`, que está en
  `AUDIT_CATEGORIES`: suscripciones y bajas no son ataques y no salen en
  `/security`.
