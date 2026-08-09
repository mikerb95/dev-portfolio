# Plan: módulo de capacitación en IA

Estado: **Fase 1 implementada** (8 ago 2026). Plan vivo: se actualiza al
implementar, no se archiva.

## Por qué existe

La capacitación en uso de inteligencia artificial es una línea de negocio
propia, distinta del desarrollo a la medida y de `/paginas-web`. El comprador
es una organización, no una persona, y lo que se vende no es una charla.

El problema real del mercado: casi todas las capacitaciones en IA enseñan
herramientas, y a la semana siguiente nadie las usa porque nunca se conectaron
con el trabajo que la gente ya tiene encima. De ahí las dos decisiones que
ordenan todo el módulo:

1. **El material sobrevive a la sesión.** Un banco de recursos permanente, con
   acceso para el grupo capacitado, en vez de un PDF por correo que nadie
   vuelve a abrir.
2. **Los ejercicios interactivos no viven aquí.** Se construyen alineados al
   modelo de negocio de cada cliente, fuera de este repo, y entran al banco
   como un recurso de tipo enlace. Meterlos aquí obligaría a generalizar lo que
   justamente tiene valor por ser específico.

## Qué se reutiliza y qué es nuevo

Reutilizado, sin duplicar:

- **Presentaciones**: `decks` sigue siendo la única fuente de verdad del
  material proyectable. Un recurso del banco solo referencia un deck; proyectar
  se sigue haciendo desde `/admin/presentaciones` con su PIN y su control
  remoto.
- **Pase HMAC**: mismo patrón que el pase de demo (`src/lib/demo.ts`).
- **Rate limit durable y micro-SIEM**: el canje del código entra por
  `enforceLimit` y `recordSecurityEvent`, no por un mecanismo nuevo.
- **Contacto**: la landing usa WhatsApp y `/api/contact`, igual que
  `/paginas-web`.

Nuevo:

- `training_programs`: catálogo comercial (lo que se contrata).
- `training_resources`: el banco (lo que se queda con la gente).
- `training_access_codes`: códigos de grupo, con vigencia, tope de canjes y
  revocación.
- Renderizador propio de un subconjunto de markdown, porque el cuerpo de un
  recurso vive en base de datos y se edita desde el panel: las content
  collections de `/notes` se compilan en build y no sirven aquí.

## Decisiones que costaron discusión

**El borrador no sale nunca.** Hay tres visibilidades y no dos:
`borrador`, `publico` y `con_codigo`. La regla que se prueba explícitamente es
que `borrador` no se publica de ninguna forma, con pase o sin él.

**El filtro de visibilidad va en el WHERE, no en el render.** Un recurso
restringido no llega al HTML de quien no tiene pase, ni siquiera oculto con
CSS.

**Fail-closed, la excepción del repo.** Todo lo de seguridad y observabilidad
aquí es fail-open. La revalidación del código del pase no: si no se puede
confirmar contra la base que el código sigue vivo, el visitante ve solo el
banco público. Abrir ante el fallo publicaría material restringido en una
respuesta que la CDN puede cachear.

**404 y no 403.** Pedir un recurso restringido sin pase redirige al banco en
vez de decir "existe pero no puedes verlo": ese inventario es justo lo que no
tiene por qué conocer quien no estuvo en la capacitación. Por lo mismo, el
canje devuelve el mismo mensaje para código inexistente, vencido, revocado o
mal escrito.

**El pase revalida en cada request.** El id del código va dentro de lo firmado.
Es lo que permite cortar el acceso de una cohorte concreta sin esperar a que
venzan las cookies de nadie.

**Escapar antes de formatear.** El markdown lo escribe el administrador, pero
se sirve en una página pública cacheada. Permitir HTML arbitrario convertiría
un copiar y pegar desafortunado en un XSS almacenado. Ninguna guía necesita
HTML.

**Alfabeto del código sin caracteres ambiguos.** Se dicta en voz alta al
cerrar la sesión y se teclea en un celular: sin O/0, sin I/1/l, sin S/5. Se
normaliza al comparar, para no dar soporte telefónico por un guion.

## Fases

### Fase 1: banco, catálogo y acceso ✅ (8 ago 2026)

- [x] Schema aditivo (migración `0026_kind_wraith.sql`, junto a las tablas de
      `skill_tracks` de la otra línea de trabajo).
- [x] Módulos puros: `markdown.ts`, `tipos.ts`, `access.ts`.
- [x] Capa de datos `repo.ts` y helper de pase `pase.ts`.
- [x] Panel `/admin/capacitacion` con banco, catálogo, códigos y métricas;
      editores de recurso (con previsualización) y de programa.
- [x] API del panel y API pública de canje.
- [x] Rate limit propio del canje (10/min por IP) y `isTrainingAccessPath`.
- [x] Público: `/capacitacion`, `/capacitacion/[slug]`,
      `/capacitacion/acceso` y landing `/capacitacion-ia`.
- [x] `tests/capacitacion.test.ts` (35 casos) y alta en `/docs`
      (RF-015, RF-016, RF-017, RF-209).
- [x] `capacitacion` y `capacitacion-ia` en `RESERVED_ROOT_SEGMENTS`: son
      rutas de un segmento en la raíz y competían con el espacio de los PIN.
      Lo cazó el test del repo, no una revisión.

Pendiente operativo: `TRAINING_ACCESS_SECRET` en Vercel y aplicar la migración
0026 a las dos bases Turso (principal y demo). Sin el secreto, el canje
responde 503 y el banco público sigue funcionando.

### Fase 2: evaluación pre/post (planeada)

Lo que de verdad diferencia esta línea de negocio: el mismo cuestionario antes
y después, por enlace firmado, y un informe de delta por grupo. Convierte el
entregable de "vinieron 30 personas" a "la competencia media subió de 2.1 a
3.8 y estos cuatro temas siguen flojos". Reutilizaría el código de grupo como
identificador de cohorte.

### Fase 3: certificados verificables (planeada)

Emisión por participante con código público verificable. Barato con lo que ya
hay (HMAC, blobs, imágenes OG) y le da al asistente algo que publica en
LinkedIn con el dominio propio.

### Fase 4: diagnóstico de madurez (planeada)

Assessment público de ~12 preguntas con informe por dimensión (datos,
procesos, gobernanza, habilidades) que aterriza como lead en el panel. Es el
lead magnet natural del servicio y encaja con el material de gobernanza que ya
vive en `/docs`.

### Fase 5: seguimiento a 30 días (planeada)

Check-in posterior a la capacitación: qué se quedó en el día a día y qué no.
Es la parte que casi nadie hace y la única que justifica una renovación.

## Qué NO va a entrar

- Ejercicios interactivos a la medida del negocio del cliente (se construyen
  aparte, por diseño).
- Un CRM de cohortes paralelo al que ya existe en `/admin/clients` y
  `/admin/seguimiento`.
- Datos personales de asistentes en el banco. Si un recurso llegara a contener
  información de un cliente, no va aquí: va en `portal_documents`, detrás del
  login del portal.
