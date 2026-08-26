// ─────────────────────────────────────────────────────────────────────────────
// Documentación de ingeniería del portfolio (codebymike.tech / dev-portfolio).
// Fuente de verdad para /docs/*. Ver docs/plan-documentacion.md.
// ─────────────────────────────────────────────────────────────────────────────

export type Estado = 'implementado' | 'parcial' | 'planeado'
export type Prioridad = 'alta' | 'media' | 'baja'

export interface Requisito {
  id: string
  titulo: string
  descripcion: string
  prioridad: Prioridad
  estado: Estado
  origen?: string // dónde vive en el código (ruta, tabla, archivo)
  verificacion?: string // cómo se comprueba: test, revisión manual, monitor en prod...
  notas?: string // notas técnicas, decisiones de diseño o riesgos conocidos
  relacionados?: string[] // ids de otros RF/RNF/CU vinculados
}

export interface Modulo {
  id: string
  nombre: string
  items: Requisito[]
}

// ── Requerimientos funcionales ──────────────────────────────────────────────
export const REQUISITOS_FUNCIONALES: Modulo[] = [
  {
    id: 'publico',
    nombre: 'Sitio público',
    items: [
      { id: 'RF-001', titulo: 'Listado de proyectos', descripcion: 'El visitante puede ver los proyectos marcados como visibles, con stack, descripción y enlaces.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/index.astro, ProjectCard.astro', verificacion: 'Revisión manual en producción; el filtro por visible=true se cubre indirectamente en tests de la API de proyectos.', notas: 'Los proyectos no visibles siguen accesibles por URL directa si se conoce el slug (no hay 404 forzado); es una decisión consciente para poder compartir previews.', relacionados: ['RF-002'] },
      { id: 'RF-002', titulo: 'Detalle de proyecto', descripcion: 'Página individual por proyecto con metadata estructurada (JSON-LD), breadcrumbs y pestaña de observabilidad si tiene monitor asociado.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/projects/[slug].astro', verificacion: 'Validación manual del JSON-LD con el Rich Results Test de Google; smoke test de que la ruta renderiza 200 para slugs existentes.', notas: 'La pestaña de observabilidad solo aparece si el proyecto tiene un monitor asociado en la tabla monitors; si no, se omite sin dejar hueco visual.', relacionados: ['RF-001', 'RF-401'] },
      { id: 'RF-003', titulo: 'Formulario de contacto', descripcion: 'El visitante puede enviar un mensaje que queda asociado a un cliente (si el email coincide) y visible en el CRM.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/api/contact.ts', verificacion: 'Test de integración sobre el endpoint (envío válido, campos faltantes, rate limit); revisión manual del correo asociado en /admin/messages.', notas: 'Protegido por el rate limiting durable (RF-603) para evitar spam; el matching de cliente es por email exacto, sin normalización de dominios.', relacionados: ['RF-203', 'RF-603'] },
      { id: 'RF-004', titulo: 'Página de estado del sistema', descripcion: 'Vista pública con uptime de 30 días, incidentes activos y latencia en tiempo real (EKG) por servicio monitoreado.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/status, src/pages/api/status', verificacion: 'Comparación manual contra los datos crudos de monitor_checks; validado en prod con los 9 monitores activos.', notas: 'Alimentada por el mismo pipeline que RF-401/RF-402; ningún dato aquí se calcula aparte, solo se proyecta lo ya persistido.', relacionados: ['RF-401', 'RF-402'] },
      { id: 'RF-005', titulo: 'Vitrina de herramientas y notas', descripcion: 'Secciones públicas /tools y /notes con artículos técnicos y mocks de herramientas internas.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/tools, src/pages/notes', verificacion: 'Revisión manual de contenido y enlaces al publicar cada artículo.', notas: 'Contenido estático versionado junto al código, no editable desde el panel admin; publicar requiere un commit.' },
      { id: 'RF-006', titulo: 'Certificaciones y evolución académica', descripcion: 'Listado público de certificaciones vigentes/expiradas y línea de tiempo de hitos educativos.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/certifications, EvolutionTimeline.astro', verificacion: 'Revisión manual del estado vigente/expirado tras cada actualización de certificaciones.' },
      { id: 'RF-007', titulo: 'SEO técnico', descripcion: 'JSON-LD, sitemap, RSS, notificación IndexNow y manifest de PWA en cada publicación.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/rss.xml, scripts/indexnow', verificacion: 'Tests unitarios de la notificación IndexNow (tests/indexnow.test.ts); validación manual del sitemap y RSS en herramientas de Search Console/Bing.', notas: 'Las altas manuales en Search Console y Bing Webmaster Tools quedan pendientes; la capa técnica está completa desde jul 2026.', relacionados: ['CU-17'] },
      { id: 'RF-008', titulo: 'Demo read-only del panel admin', descripcion: 'Versión pública sin credenciales del panel admin con datos ficticios, para que cualquiera recorra el producto sin cuenta.', prioridad: 'baja', estado: 'implementado', origen: 'src/pages/demo.astro, src/lib/demo.ts, AsyncLocalStorage en src/db/index.ts', verificacion: '17 páginas del panel responden 200 con datos ficticios; 19 centinelas de datos reales buscados en 3.2 MB de HTML servido en modo demo → cero fugas; escrituras y reveladores de secretos → 403. Cubierto por e2e/demo.spec.ts.', notas: 'El aislamiento es por diseño (base Turso distinta seleccionada por request), no por filtrar queries ni esconder botones. Hallazgo que cambió el diseño: los endpoints que revelan la bóveda son GET, así que "solo lectura" no los habría detenido - la lista de bloqueo va por patrón de ruta.', relacionados: ['RF-009', 'RNF-03'] },
      { id: 'RF-009', titulo: 'Descarga de CV con verificación de dispositivo', descripcion: 'El visitante descarga el CV desde /contact mediante un token de un solo uso (ventana de 5 min) emitido tras capturar una huella de dispositivo.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/api/cv, cv_downloads', verificacion: 'Revisión manual del ciclo captura de señales→emisión de token→descarga real dentro de la ventana de 5 min.', notas: 'Reutiliza el mismo recolector de señales del lab de fingerprinting, pero aquí sí persiste IP/UA sin TTL (es el propósito del feature).', relacionados: ['RF-704'] },
      { id: 'RF-010', titulo: 'Rutas de aprendizaje con progreso persistente', descripcion: 'Rutas educativas ("Linux Real" y otras) con labs cronometrados por nivel (Inicial/Intermedio/Avanzado); el visitante marca cada lab como completado y el progreso persiste entre visitas.', prioridad: 'baja', estado: 'implementado', origen: 'src/lib/education-paths.ts, education_lab_progress', verificacion: 'Revisión manual: completar un lab, recargar la página y confirmar que el estado persiste.', notas: 'El contenido de las rutas (título, duración, tags) es estático en código; solo el estado completado/no-completado se persiste en base de datos.' },
      { id: 'RF-011', titulo: 'Landing comercial de diseño web', descripcion: 'Página /paginas-web dirigida a negocios locales y emprendedores no técnicos: tres planes con precio visible, preguntas frecuentes y contacto por WhatsApp o formulario.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/paginas-web.astro', verificacion: 'Revisión manual del flujo hasta el envío; el formulario reutiliza /api/contact, así que hereda su rate limiting y sus tests.', notas: 'Vive deliberadamente aparte de la marca técnica del resto del sitio: el visitante que busca "una página para mi negocio" no es el mismo que lee /notes, y mezclar ambos lenguajes perdía a los dos.', relacionados: ['RF-003', 'RF-306'] },
      { id: 'RF-012', titulo: 'Agenda directa de reunión', descripcion: 'La página de contacto ofrece, además del formulario, un enlace para agendar una llamada sin intercambio previo de correos.', prioridad: 'baja', estado: 'implementado', origen: 'src/pages/contact.astro', verificacion: 'Revisión manual del enlace en producción.', relacionados: ['RF-003'] },
      { id: 'RF-013', titulo: 'Versión en inglés del sitio público', descripcion: 'Las páginas públicas de marca, las notas técnicas, el LAB y el contenido de proyectos existen bajo el prefijo /en con contenido traducido, selector de idioma que conserva la página actual y hreflang recíproco. El español sigue siendo el idioma canónico, sin prefijo.', prioridad: 'media', estado: 'implementado', origen: 'src/i18n/ (config, routing, format, localize, bilingual, es, en), src/pages/en/, src/content/notes/{es,en}/, src/lib/notes.ts, src/middleware.ts', verificacion: 'tests/i18n-routing.test.ts (registro de rutas cruzado contra los archivos reales de src/pages/en en las dos direcciones), tests/i18n-dictionary.test.ts (paridad de claves ES/EN y detección de traducciones olvidadas), tests/i18n-localize.test.ts y tests/i18n-bilingual.test.ts (fallback al español fila a fila). Barrido en vivo: 36 páginas /en rastreadas sin ningún enlace roto, 57 enlaces salientes comprobados, 16/16 hreflang recíprocos y cero español residual en el texto renderizado. npx astro check rompe si una clave existe en un diccionario y no en el otro.', notas: 'Traducido: las 12 páginas de marca, los 14 artículos de /notes (con slug propio en inglés y translationOf recíproco), el LAB completo incluido el analizador de sitios y las salas de fingerprinting, el contenido de projects en base de datos y las 9 imágenes Open Graph. Una sola implementación por página: la variante /en es un cascarón de tres líneas que reexporta la misma página, el locale sale de la URL del request. TRANSLATED_ROUTES/TRANSLATED_PREFIXES en src/i18n/routing.ts son la única fuente de verdad de qué existe en inglés: los enlaces, el sitemap y el hreflang solo apuntan a /en cuando la ruta está declarada, y el middleware redirige el resto de /en/* a su versión en español (302) en vez de dejar un 404. El contenido que se traduce fila a fila (proyectos) usa pickLocalized: una fila sin traducir se muestra en español y no se anuncia como versión inglesa. Fuera de alcance por decisión explícita (30 jul 2026): /docs se queda en español - es material académico normativo cuya audiencia es el jurado de la sustentación. Pendiente: el CV en PDF en inglés, que es un documento a redactar, no código.', relacionados: ['RF-007', 'RF-014', 'RNF-20', 'RNF-21'] },
      { id: 'RF-014', titulo: 'Sugerencia de idioma no intrusiva', descripcion: 'Un visitante cuyo navegador declara preferencia por el inglés ve una invitación discreta a cambiar de idioma; la URL nunca cambia de contenido por sí sola.', prioridad: 'baja', estado: 'implementado', origen: 'src/components/LanguageSuggestModal.astro', verificacion: 'Revisión manual con el idioma del navegador cambiado; la sugerencia se descarta y no reaparece.', notas: 'La detección por Accept-Language se usa como sugerencia, nunca como mecanismo de ruteo: servir contenido distinto en la misma URL obligaría a un Vary: Accept-Language que rompería el Cache-Control público de la CDN.', relacionados: ['RF-013', 'RNF-13'] },
      { id: 'RF-015', titulo: 'Landing comercial de capacitación en IA', descripcion: 'Página /capacitacion-ia con los programas de formación publicados desde el panel (formato, nivel, duración, objetivos de aprendizaje, temario desplegable y nota de precio), el proceso de trabajo en cuatro pasos, preguntas frecuentes y contacto por WhatsApp o formulario.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/capacitacion-ia.astro, training_programs (isPublic), src/lib/capacitacion/repo.ts', verificacion: 'Revisión manual del catálogo publicado contra el panel; el catálogo sale de base de datos, así que un programa publicado aparece sin tocar el archivo. El contacto reutiliza /api/contact y hereda su rate limiting y sus tests.', notas: 'Ningún texto de programa se escribe en el .astro: solo el marco comercial (perfiles, proceso, FAQ). Si la lectura del catálogo falla, la landing sigue sirviendo hero, proceso y contacto en vez de caer: media página vende, un 500 no.', relacionados: ['RF-016', 'RF-017', 'RF-011', 'RF-003'] },
      { id: 'RF-016', titulo: 'Banco público de recursos de capacitación', descripcion: 'Repositorio general de guías, prompts, plantillas, checklists y presentaciones en /capacitacion, con detalle por recurso en /capacitacion/[slug], contenido en markdown renderizado en el servidor y contador de lecturas.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/capacitacion/, src/lib/capacitacion/{repo,markdown,tipos}.ts, training_resources', verificacion: 'tests/capacitacion.test.ts (35 casos): el renderizador escapa el HTML del origen antes de formatear, rechaza enlaces javascript:/data:, y visibilidadesVisibles nunca deja salir un borrador con pase ni sin él.', notas: 'Es material general y reutilizable a propósito: los ejercicios interactivos se construyen alineados al modelo de negocio de cada cliente, viven fuera de este repo y entran aquí solo como enlace. Las presentaciones no se duplican: un recurso de tipo deck referencia la tabla decks, que sigue siendo la única fuente de verdad del material proyectable. El markdown se guarda en base de datos y se renderiza en cada request con un subconjunto propio, porque las content collections de /notes se compilan en build y este contenido se edita desde el panel.', relacionados: ['RF-017', 'RF-018', 'RF-306'] },
      { id: 'RF-017', titulo: 'Acceso por código de grupo al material restringido', descripcion: 'Los recursos marcados "con código" solo aparecen a quien canjeó en /capacitacion/acceso el código que se dicta al cerrar una capacitación; el canje entrega un pase firmado por 30 días, sin correo ni cuenta.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/capacitacion/{access,pase}.ts, src/pages/api/capacitacion/acceso.ts, training_access_codes, TRAINING_ACCESS_SECRET', verificacion: 'tests/capacitacion.test.ts: el pase no se verifica con otro secreto ni sin secreto, reescribir el vencimiento o el id de cohorte invalida la firma, los tokens malformados se rechazan sin lanzar, y codigoUtilizable cubre revocado/vencido/cupo agotado. isTrainingAccessPath solo cubre el canje, no el banco.', notas: 'No es autenticación de una persona: es un pase que dice "este navegador estuvo en una capacitación". El id del código viaja dentro de lo firmado y se revalida contra la base en cada request, que es lo que permite cortar el acceso de una cohorte sin esperar a que venzan las cookies. Es el único punto del repo que falla CERRADO: si no se puede confirmar que el código sigue vivo, el visitante ve solo el banco público, porque abrir aquí publicaría material restringido en una respuesta que la CDN puede cachear. El canje devuelve el mismo mensaje para código inexistente, vencido, revocado o mal escrito, y tiene rate limit propio (10/min por IP).', relacionados: ['RF-016', 'RF-603', 'RNF-03'] },
    ],
  },
  {
    id: 'auth',
    nombre: 'Autenticación y sesiones',
    items: [
      { id: 'RF-101', titulo: 'Login con GitHub OAuth', descripcion: 'El administrador inicia sesión con su cuenta de GitHub; solo los logins en la allowlist obtienen acceso.', prioridad: 'alta', estado: 'implementado', origen: 'auth.config.ts, src/lib/auth.ts', verificacion: 'Probado manualmente contra la cuenta real de GitHub; login fuera de la allowlist se verifica que sea rechazado.', notas: 'Fase reciente añadió login sin contraseña vía WebAuthn/FIDO2 como alternativa; la allowlist sigue siendo la única fuente de autorización.', relacionados: ['RF-102', 'RNF-02', 'CU-04'] },
      { id: 'RF-102', titulo: 'Protección de rutas /admin', descripcion: 'Todas las rutas /admin y /api/admin exigen sesión válida; sin sesión, redirige a login.', prioridad: 'alta', estado: 'implementado', origen: 'src/middleware.ts', verificacion: 'Test de integración del middleware que golpea rutas /admin sin cookie de sesión y espera redirect.', relacionados: ['RF-101', 'RNF-02'] },
      { id: 'RF-103', titulo: 'Gestión de dispositivos/sesiones', descripcion: 'El administrador ve las sesiones activas por dispositivo (IP, user-agent, última actividad) y puede revocarlas.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/sessions.astro, admin_sessions', verificacion: 'Revisión manual: revocar una sesión desde el panel y confirmar que ese dispositivo pierde acceso en el siguiente request.' },
      { id: 'RF-104', titulo: 'Cierre de sesión', descripcion: 'El administrador puede cerrar su sesión desde cualquier página del panel.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/api/auth', verificacion: 'Revisión manual: logout limpia la cookie de sesión y la siguiente visita a /admin redirige a login.' },
    ],
  },
  {
    id: 'crm',
    nombre: 'CRM (proyectos, clientes, seguimiento)',
    items: [
      { id: 'RF-201', titulo: 'Gestión de proyectos', descripcion: 'Alta, edición y archivo de proyectos con estado, fechas, stack, cliente asociado y visibilidad pública.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/projects, projects', verificacion: 'Test de la API POST /api/admin/projects (400 sin slug/title); revisión manual del ciclo alta→edición→archivo.', relacionados: ['CU-06'] },
      { id: 'RF-202', titulo: 'Gestión de clientes', descripcion: 'Alta y edición de clientes con datos de contacto y notas internas.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/clients.astro, clients', verificacion: 'Revisión manual del formulario de alta/edición.' },
      { id: 'RF-203', titulo: 'Bandeja de mensajes', descripcion: 'El administrador ve, marca como leídos y responde mensajes recibidos por el formulario público.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/messages.astro, messages', verificacion: 'Revisión manual: enviar un mensaje desde el formulario público y confirmar que aparece en la bandeja.', relacionados: ['RF-003'] },
      { id: 'RF-204', titulo: 'Seguimiento comercial (interacciones)', descripcion: 'Registro de llamadas, reuniones, notas y tareas pendientes por cliente/proyecto, con recordatorios (nextAction/dueDate).', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/seguimiento.astro, interactions', verificacion: 'Revisión manual del ciclo crear→marcar como resuelta (done/doneAt) en /admin/seguimiento.', relacionados: ['CU-06'] },
      { id: 'RF-205', titulo: 'Briefings de cliente', descripcion: 'Documento de alcance por proyecto con objetivo, presupuesto estimado/acordado, horas e ítems (requerimiento/entregable/exclusión).', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/briefings, briefings, briefing_items', verificacion: 'Revisión manual creando un briefing completo con ítems de los tres tipos.', relacionados: ['CU-07'] },
      { id: 'RF-206', titulo: 'Contactos por proyecto', descripcion: 'Registro de contactos (cliente, PM, dev, QA, diseño) asociados a un proyecto.', prioridad: 'baja', estado: 'implementado', origen: 'project_contacts', verificacion: 'Revisión manual desde el detalle de proyecto.' },
      { id: 'RF-207', titulo: 'Decisiones de arquitectura (ADRs)', descripcion: 'Registro de decisiones técnicas por proyecto con contexto, decisión, justificación y alternativas consideradas; opcionalmente públicas.', prioridad: 'media', estado: 'implementado', origen: 'project_adrs', verificacion: 'Revisión manual del flag isPublic reflejándose en la vitrina pública del proyecto.', relacionados: ['RNF-15', 'CU-06'] },
      { id: 'RF-208', titulo: 'Presentaciones proyectadas con público en sincronía', descripcion: 'Biblioteca de decks HTML autónomos y sesiones de proyección: pantalla principal, control remoto desde el celular y vista del público en sincronía por PIN corto servido en la raíz del dominio.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/present/*, src/pages/admin/presentaciones, src/pages/present/[sessionId], src/pages/remote/[sessionId], src/pages/[pin], decks/deck_slides', verificacion: 'tests/present-sync.test.ts levanta dos clientes suscritos al bus y comprueba que un salto de slide llega a ambos con el mismo valor y en orden; tests/present-pin.test.ts cubre la generación del PIN sin colisión con rutas reservadas; tests/present-state.test.ts, la máquina de estados.', notas: 'Sustituye por completo al sistema anterior (imágenes PNG por proyecto, sincronizadas por polling). El estado vivo de la sesión (PIN, slide actual, secreto del presentador) es EFÍMERO y vive en Redis con TTL de 6 h, nunca en Turso; en Turso solo queda la biblioteca de decks y el feedback. El tiempo real no gasta compute sostenido: el público abre su EventSource directamente contra el bus de Upstash con un token de solo lectura, en vez de contra una función de Vercel, que quedaría abierta una por espectador durante toda la charla. El bus lleva únicamente números de slide. El diseño inicial exigía DOS bases de Redis separadas para que ese token público no alcanzara el secreto del presentador; se resolvió por el otro lado, sin infraestructura: el secreto ya no se guarda, se deriva del id de sesión con HMAC, de modo que lo único que hay en Redis es el mismo snapshot que el público ya recibe al teclear el PIN. Una sola base en plan gratuito sostiene ambos roles, y un test recorre cada valor del JSON almacenado exigiendo un 403 por cada uno - falla en el momento en que alguien vuelva a persistir el secreto.', relacionados: ['CU-16'] },
      { id: 'RF-209', titulo: 'Gestión del módulo de capacitación', descripcion: 'Panel único en /admin/capacitacion para el banco de recursos (alta, edición con previsualización del markdown y borrado), el catálogo de programas y los códigos de grupo (generación, revocación y reactivación), con cifras de material publicado, borradores, lecturas y canjes.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/capacitacion/, src/pages/api/admin/capacitacion/, training_programs, training_resources, training_access_codes', verificacion: 'tests/capacitacion.test.ts cubre la lógica pura (slug, listas JSON, guardas de enumeración, códigos y pases). Revisión manual del ciclo alta→publicación→lectura desde la página pública, y del código generado→canjeado→revocado.', notas: 'La previsualización del panel usa el MISMO renderizador que la página pública: si se vieran distintas, la previsualización serviría solo para llevarse una sorpresa después. El código legible se devuelve una única vez, en la respuesta del alta, y por eso ese formulario no recarga la página. Revocar existe y borrar un código no: un código revocado deja de valer al instante y conserva el rastro de a qué grupo se le dio. La fecha de publicación se fija al salir de borrador y no se toca al reeditar.', relacionados: ['RF-016', 'RF-017', 'RF-208'] },
    ],
  },
  {
    id: 'finanzas',
    nombre: 'Finanzas',
    items: [
      { id: 'RF-301', titulo: 'Registro de ingresos', descripcion: 'Alta de cobros por proyecto/cliente con estado (cobrado/pendiente/proyectado) y fecha de vencimiento.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/finances.astro, finances', verificacion: 'Revisión manual del ciclo proyectado→pendiente→cobrado.', relacionados: ['RF-302', 'CU-08'] },
      { id: 'RF-302', titulo: 'Costos y P&L por proyecto', descripcion: 'Registro de costos de servicios (hosting, dominio, DB, etc.) con quién paga y cuánto se le factura al cliente, para calcular la rentabilidad real.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/admin/costs.astro, project_services, src/lib/pnl.ts', verificacion: 'Revisión manual del cálculo de projectPnL() contra costos e ingresos conocidos de un proyecto real.', notas: 'Costos en moneda sin tasa de cambio configurada se excluyen del total y se marcan como advertencia en vez de fallar el cálculo.', relacionados: ['RF-301', 'RF-303', 'CU-08'] },
      { id: 'RF-303', titulo: 'Bóveda cifrada de credenciales', descripcion: 'Secrets de servicios (API keys, tokens) cifrados con AES-256-GCM en reposo, revelados on-demand vía fetch autenticado.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/crypto.ts, project_services.secrets', verificacion: 'Revisión manual: inspección directa de la base de datos confirma que el valor almacenado no es texto plano.', notas: 'Requiere ENCRYPTION_KEY configurada; sin ella, la API de guardado de credenciales responde 500 en vez de guardar en claro.', relacionados: ['RNF-01'] },
      { id: 'RF-304', titulo: 'Variables de entorno por proyecto', descripcion: 'Registro cifrado de variables de entorno por ambiente (producción/staging/dev) para cada proyecto gestionado.', prioridad: 'media', estado: 'implementado', origen: 'project_env_vars', verificacion: 'Revisión manual del cifrado en reposo, igual que RF-303.', relacionados: ['RNF-01'] },
      { id: 'RF-305', titulo: 'Alertas de vencimiento de dominios', descripcion: 'Descubrimiento automático de fecha de expiración vía RDAP y alerta por email/push antes del vencimiento.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/domains.astro, src/lib/domains.ts', verificacion: 'Validado en prod contra dominios reales del portfolio; la fecha RDAP se contrasta manualmente con el registrador.', relacionados: ['RF-404'] },
      { id: 'RF-306', titulo: 'Cobros de campo por WhatsApp', descripcion: 'Desde el celular se configura monto y teléfono, se previsualiza el mensaje y se envía por WhatsApp; el cliente paga en la pasarela existente a través de un link corto público /c/[code].', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/cobrar.astro, src/pages/c/[code].astro, src/lib/cobros*.ts', verificacion: '48 tests (phone, cobros, cobros-db, mis-pagos), incluidos los de concurrencia sobre libSQL en archivo temporal.', notas: 'Sin API de WhatsApp: el botón abre wa.me desde el propio celular. Un cobro es una fila de payments con campos extra, no una tabla ni una máquina de estados paralela - el monto se firma siempre en el servidor, nunca viaja en la URL del mensaje.', relacionados: ['RF-307', 'RF-502'] },
      { id: 'RF-307', titulo: 'Histórico de pagos del cliente', descripcion: 'El cliente consulta sus pagos en /mis-pagos mediante un link firmado incluido en el mensaje de WhatsApp; la consulta manual por número muestra datos enmascarados.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/mis-pagos.astro, src/lib/mis-pagos.ts', verificacion: 'Tests del token HMAC y del enmascarado (tests/mis-pagos.test.ts).', notas: 'El teléfono no es autenticación: solo el token HMAC abre el historial completo, y la consulta manual lleva rate limiting fuerte.', relacionados: ['RF-306'] },
    ],
  },
  {
    id: 'portal',
    nombre: 'Portal de clientes',
    items: [
      { id: 'RF-801', titulo: 'Acceso autenticado del cliente', descripcion: 'El cliente entra a /portal con email y contraseña, con recuperación por email y aceptación de invitación; el sistema de sesiones es propio y no comparte nada con el del administrador.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/portal/*, portal_sessions, src/pages/portal', verificacion: 'Cubierto por tests/portal-passwords.test.ts, portal-paths.test.ts y e2e/portal.spec.ts.', notas: 'Contraseñas con scrypt; el token de sesión es opaco y en base solo vive su sha-256. Renovación deslizante con throttle y revocación inmediata.', relacionados: ['RF-802', 'RNF-02'] },
      { id: 'RF-802', titulo: 'Aislamiento entre clientes (multi-tenant)', descripcion: 'Ninguna consulta del portal acepta el identificador de cliente desde el request: siempre sale de la sesión y viaja en el WHERE aunque ya haya un id de proyecto.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/portal/projects.ts, requirePortalSession()', verificacion: 'tests/portal-isolation.test.ts (26 tests) intenta explícitamente leer recursos de otro tenant.', notas: 'Es el requisito del que cuelga todo el portal: un fallo aquí no degrada una función, expone los datos de un cliente a otro.', relacionados: ['RF-801'] },
      { id: 'RF-803', titulo: 'Facturas y descarga en PDF', descripcion: 'El cliente ve sus facturas con estado y vencimiento, y descarga cada una en PDF.', prioridad: 'alta', estado: 'implementado', origen: 'src/pages/portal/facturas, src/pages/api/portal/facturas', verificacion: 'tests/portal-invoices.test.ts + recorrido e2e de la descarga.', relacionados: ['RF-301'] },
      { id: 'RF-804', titulo: 'Mensajería con el cliente', descripcion: 'Hilos de conversación por proyecto entre el cliente y el administrador, con estado de leído.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/portal/mensajes, src/pages/admin/portal', verificacion: 'Recorrido manual de ida y vuelta entre el portal y el panel admin.' },
      { id: 'RF-805', titulo: 'Documentos y avance del proyecto', descripcion: 'El cliente ve los documentos compartidos y el avance por hitos de su proyecto.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/portal/documentos, src/pages/portal/index.astro', verificacion: 'Recorrido manual desde una cuenta de cliente sembrada.', notas: 'El avance depende de que el administrador edite los hitos a mano: entre hito e hito la barra no se mueve aunque haya habido deploys. Es el gap que ataca docs/plan-portal-tiempo-real.md.', relacionados: ['RF-807'] },
      { id: 'RF-806', titulo: 'Impersonación de soporte read-only', descripcion: 'El administrador puede ver el portal como un cliente concreto para dar soporte, sin poder escribir nada en su nombre.', prioridad: 'media', estado: 'implementado', origen: 'src/middleware.ts, src/pages/admin/portal', verificacion: 'El corte es doble: en el middleware y además en /api/payments/mock/pay, que vive fuera del prefijo /api/portal/ y se habría escapado del primer guard.', relacionados: ['RF-802'] },
      { id: 'RF-807', titulo: 'Actualización en vivo del portal', descripcion: 'La información del portal (notificaciones, mensajes, facturas, salud del proyecto) se refresca sola mientras la pestaña está visible, sin recargar.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/portal/live.ts · src/pages/api/portal/live.ts · script de PortalLayout.astro', verificacion: 'tests/portal-live.test.ts (aislamiento entre clientes, rol billing sin mensajes, projectId ajeno cae al propio) + e2e/portal.spec.ts (401 sin sesión, digest sobre la base de demo)', notas: 'Fase A entregada el 30 jul 2026: polling de un digest cada 20 s, no SSE ni WebSockets - Turso no tiene pub/sub, así que el servidor tendría que sondear igual, pagando además la conexión abierta. Un único ciclo en el layout emite CustomEvent y lo escuchan campana, dashboard y hilo abierto: tres suscriptores, una sola petición. Pausa con la pestaña oculta, backoff 20→300 s, rate limit de 10/min por sesión y fail-open silencioso. Pendiente la Fase B (feed de actividad por proyecto).', relacionados: ['RF-805'] },
      { id: 'RF-808', titulo: 'Feed de actividad del proyecto', descripcion: 'El cliente ve una línea de tiempo de lo que ha pasado en sus proyectos (hitos, facturas, mensajes), con filtro por tipo y paginación.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/portal/activity.ts · src/components/portal/ActivityFeed.astro · src/pages/portal/actividad.astro · src/pages/admin/portal/actividad.astro', verificacion: 'tests/portal-activity.test.ts (aislamiento entre clientes, cursor sin repetir ni saltar filas, interruptor de visibilidad) + tests/portal-live.test.ts (activityLastAt en el digest)', notas: 'Fase B del plan de tiempo real, 30 jul 2026. Tabla portal_activity con clientId denormalizado a propósito: el feed se lee siempre filtrando por él y la consulta más caliente del portal no debe depender de un JOIN. El emisor es fire-and-forget y nunca lanza. Las entradas se apagan desde /admin/portal/actividad en vez de borrarse. Pendiente el tipo deploy: ci_runs no tiene projectId, así que no hay forma de atribuir una corrida a un cliente sin cambiar el modelo.', relacionados: ['RF-805', 'RF-807'] },
      { id: 'RF-808', titulo: 'Portal de demostración', descripcion: 'Un tenant marcado como demo permite recorrer el portal sin ser cliente, con re-siembra automática por cron.', prioridad: 'baja', estado: 'implementado', origen: 'src/pages/api/portal/demo.ts, src/pages/api/cron/portal-demo-reseed.ts', verificacion: 'tests/portal-demo.test.ts.', relacionados: ['RF-008'] },
      { id: 'RF-809', titulo: 'Vigilancia del propio portal', descripcion: 'Endpoint público de salud que ejerce la cadena real de dependencias del portal, sondeado por el motor de uptime propio para que el portal aparezca en /status como cualquier otro servicio.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/portal/health.ts, src/pages/api/portal/health.ts, scripts/register-portal-monitor.mjs', verificacion: 'tests/portal-health.test.ts, incluido un caso que renombra una tabla del portal contra una base libSQL real y comprueba que el chequeo lo detecta.', notas: 'No sondea /portal/login: esa página renderiza sin tocar la base, así que un 200 ahí probaría solo que el SSR responde. El chequeo corre el mismo join de tres tablas que resuelve una sesión, con un id imposible. Es la única parte de la observabilidad que NO es fail-open: si algo está roto tiene que decirlo. La respuesta es pública y por eso no lleva ningún conteo ni dato de clientes, solo booleanos y milisegundos.', relacionados: ['RF-401', 'RF-801'] },
    ],
  },
  {
    id: 'observabilidad',
    nombre: 'Observabilidad',
    items: [
      { id: 'RF-401', titulo: 'Monitoreo de disponibilidad', descripcion: 'Checks HTTP periódicos (cron externo) por servicio, con umbral de latencia degradada y validación de contenido esperado.', prioridad: 'alta', estado: 'implementado', origen: 'monitors, src/pages/api/cron', verificacion: 'Validado en prod: 9 monitores activos con cron-job.org disparando cada ~5 min desde jul 2026.', notas: 'El cron es externo (cron-job.org o Vercel Cron), no un proceso propio; el endpoint exige CRON_SECRET.', relacionados: ['CU-09', 'RF-004'] },
      { id: 'RF-402', titulo: 'Historial de incidentes', descripcion: 'Agrupación automática de caídas consecutivas (primer fallo → primer éxito) con causa y duración.', prioridad: 'alta', estado: 'implementado', origen: 'monitor_incidents', verificacion: 'Verificado con caídas reales y con chaos engineering (RF-503) simulando la caída.', relacionados: ['RF-401', 'RF-503'] },
      { id: 'RF-403', titulo: 'SLO / error budget', descripcion: 'Cálculo de SLI/SLO configurable (objetivo % y ventana en días) por monitor, con presupuesto de error restante.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/lab/slo.astro, src/lib/slo.ts', verificacion: 'Contraste manual del cálculo contra el uptime crudo de monitor_checks para una ventana conocida.', relacionados: ['RNF-09'] },
      { id: 'RF-404', titulo: 'Notificaciones push', descripcion: 'Alertas push (ntfy.sh) ante caídas de monitores, vencimientos de dominio y anomalías de seguridad.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/notify.ts', verificacion: 'Validado en prod tras corregir un bug de emoji en el header HTTP que rompía todas las alertas.', notas: 'El header HTTP de ntfy no soporta emojis directamente en el título; requiere codificarlos aparte.' },
      { id: 'RF-405', titulo: 'Web Vitals (RUM)', descripcion: 'Captura de Core Web Vitals de visitantes reales, sin PII, para calcular p75 públicos.', prioridad: 'baja', estado: 'implementado', origen: 'web_vitals, src/lib/vitals.ts', verificacion: 'Revisión manual de que el payload capturado no incluye IP ni identificadores personales.', relacionados: ['RNF-05', 'RNF-12'] },
      { id: 'RF-406', titulo: 'Certificados TLS', descripcion: 'Verificación periódica de expiración de certificado TLS por monitor con badge de alerta.', prioridad: 'baja', estado: 'implementado', origen: 'monitors.sslExpiresAt', verificacion: 'Validado contra la fecha real de expiración de los certificados de los dominios monitoreados.' },
    ],
  },
  {
    id: 'lab',
    nombre: 'LAB (SENA)',
    items: [
      { id: 'RF-501', titulo: 'Pipeline CI/CD con rollback', descripcion: 'Registro de runs de CI (GitHub Actions) con tests, cobertura, health check post-deploy y rollback automático si falla.', prioridad: 'alta', estado: 'implementado', origen: 'ci_runs, src/pages/admin/lab/pipeline.astro', verificacion: 'Validado provocando un health check fallido intencional y confirmando el rollback automático.', relacionados: ['RNF-08'] },
      { id: 'RF-502', titulo: 'Pasarela de pagos con idempotencia', descripcion: 'Cobros con clave de idempotencia única, máquina de estados sin retrocesos y bitácora de eventos de webhook (incl. duplicados y fuera de orden).', prioridad: 'alta', estado: 'implementado', origen: 'payments, payment_events, src/lib/payments.ts', verificacion: 'Test de integración reenviando el mismo webhook y uno fuera de orden, comprobando que el estado no se corrompe.', relacionados: ['RNF-06', 'RNF-07', 'CU-12'] },
      { id: 'RF-503', titulo: 'Chaos engineering', descripcion: 'Inyección de fallos reales (500, 503, latencia) por ruta con TTL obligatorio y kill-switch de pánico; /admin y /api/auth excluidos por código.', prioridad: 'media', estado: 'implementado', origen: 'chaos_flags, src/lib/chaos.ts', verificacion: 'Validado en LAB activando un flag y confirmando que el monitoreo (RF-401/402) lo detecta como caída real.', notas: 'La exclusión de /admin, /api/admin y /api/auth es por código (hardcoded), no configurable, para evitar auto-sabotaje.', relacionados: ['RF-402', 'CU-13'] },
      { id: 'RF-504', titulo: 'Historial de experimentos', descripcion: 'Bitácora de experimentos del LAB con resultado esperado vs. real, como evidencia para sustentación.', prioridad: 'baja', estado: 'implementado', origen: 'lab_experiments', verificacion: 'Revisión manual del registro tras cada experimento de chaos engineering.' },
      { id: 'RF-505', titulo: 'Pruebas de carga y estrés (k6)', descripcion: 'Escenarios de carga y estrés contra endpoints críticos: escalera de niveles de concurrencia, punto de quiebre, recuperación tras la saturación y consumo de CPU/heap del proceso.', prioridad: 'media', estado: 'parcial', origen: 'lab/k6/carga.js (ítem 5 del checklist), lab/k6/estres.js (ítem 6), lab/k6/lib/perfil.js, src/pages/api/lab/proceso.ts', verificacion: 'Corridas reales locales (ago 2026) contra el servidor de `npm run dev:carga`, con resultados en lab/k6/resultados/*.json: escalera de capacidad en carga.js, y en estres.js escalera del quiebre + fila de recuperación por tramos de 15 s + CPU%/heap por escalón + bloque de hallazgos H-01 a H-05, completado en docs/plan-lab-fases-pendientes.md tras revisar la corrida de referencia con CPU%/heap.', notas: 'Fase 5 del plan LAB (docs/plan-lab.md, detalle en docs/plan-lab-fases-pendientes.md). Los scripts corren y producen evidencia real, pero falta la integración con el panel: tabla load_test_runs, ingesta kind:"load_test" y página /admin/lab/load, bloqueada por un target de preview/staging estable (VERCEL_TOKEN en GitHub Secrets). Guardarraíl de dos mitades en lib/perfil.js: rechaza URLs de producción y además verifica que el servidor lea de una base LOCAL antes de levantar un solo VU (RNF-25). Hallazgos clave: el colapso es de concurrencia (CPU/heap no suben junto con el error), no hay margen amplio entre el nivel sano y el roto, y sin ventana de enfriamiento entre corridas la recuperación puede no completarse en los 120 s medidos - por eso el propio endpoint de muestreo (proceso.ts) puede saturarse y falseaba "CPU 0%" en vez de "sin dato" hasta el fix de ago 2026 en estres.js.', relacionados: ['RNF-25'] },
      { id: 'RF-506', titulo: 'SAST y accesibilidad automatizadas', descripcion: 'Análisis estático de seguridad (npm audit + CodeQL) y auditoría de accesibilidad (axe-core sobre Playwright) que ingieren sus hallazgos al panel del LAB.', prioridad: 'media', estado: 'implementado', origen: 'security_findings, src/lib/lab/findings.ts, .github/workflows/security.yml y a11y.yml', verificacion: 'Corridas reales, no fixtures: npm audit reportó 15 paquetes vulnerables y axe encontró 9 violaciones de contraste WCAG AA en las 8 páginas públicas; el ciclo resolver → reflejarse en /lab se probó end-to-end.', notas: 'Los hallazgos se deduplican por fingerprint source|ruleId|route entre corridas, y lo que deja de aparecer se auto-resuelve.', relacionados: ['RNF-18', 'RF-508'] },
      { id: 'RF-507', titulo: 'Mutation testing y pruebas de contrato', descripcion: 'Medición de la calidad real de la suite mediante mutantes (Stryker) y congelado de la forma de las respuestas de API con esquemas Zod.', prioridad: 'baja', estado: 'implementado', origen: 'stryker.config.json, src/lib/lab/mutation.ts, src/lib/contracts.ts', verificacion: 'Corrida real de Stryker sobre src/lib: mutation score 87.2 % registrado en ci_runs. Los tests de contrato llaman al handler real, no a un mock, y uno de ellos comprueba que renombrar un campo rompe el esquema.', notas: 'El workflow corre por workflow_dispatch y los domingos, nunca en push: mutar todo src/lib es caro y no debe bloquear un deploy.' },
      { id: 'RF-508', titulo: 'DAST con OWASP ZAP', descripcion: 'Escaneo dinámico baseline contra el deployment de preview, con el reporte JSON ingerido como hallazgos del LAB junto a los de SAST.', prioridad: 'media', estado: 'implementado', origen: '.github/workflows/dast.yml, parseZapReport en src/lib/lab/findings.ts', verificacion: 'Tests unitarios del parser del reporte de ZAP (tests/findings.test.ts) sobre reportes reales.', notas: 'spider.parseRobotsTxt=false a propósito: un atacante tampoco respeta robots.txt. Nunca corre contra producción.', relacionados: ['RF-506'] },
    ],
  },
  {
    id: 'seguridad',
    nombre: 'Seguridad (micro-SIEM)',
    items: [
      { id: 'RF-601', titulo: 'Sensor de requests hostiles', descripcion: 'Clasificación de cada request por firmas conocidas (OWASP) de forma síncrona y no bloqueante en el middleware.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/security/sensor.ts, classify.ts', verificacion: 'Test unitario de classify.ts contra payloads de ataque conocidos (path traversal, SQLi, XSS).', notas: 'La escritura del evento es fire-and-forget para no añadir latencia al request real (RNF-11).', relacionados: ['RNF-11', 'CU-14'] },
      { id: 'RF-602', titulo: 'Blocklist de IPs', descripcion: 'Bloqueo (manual o automático) de IPs con TTL obligatorio y respuesta 403 seca; sin bloqueos eternos.', prioridad: 'alta', estado: 'implementado', origen: 'blocked_ips, src/lib/security/blocklist.ts', verificacion: 'Test de integración: IP bloqueada recibe 403, y tras expiresAt vuelve a pasar.', relacionados: ['RNF-04', 'RF-601', 'CU-14'] },
      { id: 'RF-603', titulo: 'Rate limiting durable', descripcion: 'Límite de tasa por clave respaldado en base de datos, que sobrevive a redeploys (reemplaza la implementación en memoria).', prioridad: 'alta', estado: 'implementado', origen: 'rate_limit_buckets, src/lib/security/ratelimit-durable.ts', verificacion: 'Test de integración validando que el contador persiste entre reinicios simulados del proceso.', relacionados: ['RNF-10', 'CU-15'] },
      { id: 'RF-604', titulo: 'Agregación y rollups', descripcion: 'Agregados horarios/diarios de eventos de seguridad por categoría para tendencias y detección de anomalías.', prioridad: 'media', estado: 'implementado', origen: 'security_rollups', verificacion: 'Revisión manual comparando el rollup contra el conteo crudo de security_events de la misma ventana.', relacionados: ['RF-605'] },
      { id: 'RF-605', titulo: 'Detección de anomalías', descripcion: 'Detector estadístico (z-score sobre baseline de 30 días) de picos, patrones nuevos, anomalías geográficas y ráfagas de error.', prioridad: 'media', estado: 'implementado', origen: 'security_anomalies, src/lib/security/anomaly.ts', verificacion: 'Verificado e2e con baseline de 15 días + spike de 40 → 2 anomalías detectadas (spike y new_pattern); anti-fatiga confirmada en un segundo disparo (0 anomalías nuevas).', relacionados: ['RF-604'] },
      { id: 'RF-606', titulo: 'Panel de seguridad consolidado', descripcion: 'Vista en /admin con eventos, anomalías y acciones de respuesta (bloquear IP, marcar revisado).', prioridad: 'media', estado: 'implementado', origen: 'src/pages/admin/security.astro, src/pages/api/admin/security.ts', verificacion: 'Guard de sesión verificado (redirect 302 sin cookie) tanto en la página como en la API de mutación.', relacionados: ['RF-602', 'RF-605'] },
      { id: 'RF-607', titulo: 'Bloqueo escalado con enforcement inline de honeypots', descripcion: 'El TTL de bloqueo escala con la reincidencia (1h → 24h → 7d) leyendo el contador hits de blocked_ips; un hit a un honeypot bloquea la IP inline en el middleware, sin depender solo del cron de auto-block.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/security/blocklist.ts (blockIpEscalated), src/middleware.ts', verificacion: 'Test con libSQL temporal (tests/security-blocklist-db.test.ts) del escalado real sobre el onConflictDoUpdate de blocked_ips.', notas: 'El cron sigue siendo el backstop para la ráfaga high/critical y la purga de bloqueos vencidos - el inline solo cubre el caso honeypot, que es intención inequívoca.', relacionados: ['RF-602'] },
    ],
  },
  {
    id: 'sistema',
    nombre: 'Sistema',
    items: [
      { id: 'RF-701', titulo: 'Backups automáticos', descripcion: 'Snapshot periódico de la base de datos subido a Vercel Blob vía cron, más creación manual desde el panel.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/backup.ts, src/pages/api/cron/backup.ts (automático), src/pages/api/admin/backup.ts y src/pages/admin/backup.astro (manual y listado)', verificacion: 'Revisión manual: descargar un backup generado y confirmar que el JSON contiene las tablas de negocio esperadas. tests/demo.test.ts comprueba que la ruta del cron queda vetada en la demo.', notas: 'Estuvo un mes sin producir un solo archivo y nadie se enteró (descubierto ago 2026, con el store de Blob vacío). Dos fallos que se tapaban entre sí: el endpoint vivía bajo /api/admin/, donde el middleware exige sesión, así que el cron de Vercel se llevaba un 302 a /login; y el handler del backup era POST mientras que los crons de Vercel disparan GET, con lo que la petición diaria caía en el GET de "listar backups" y devolvía 200. El panel de Vercel marcaba el cron en verde. Lección: un cron que solo puede devolver 200 no está verificado, está silenciado - por eso este es el único cron del repo que NO es fail-open y devuelve 500 cuando falla.', relacionados: ['CU-11', 'RNF-25'] },
      { id: 'RF-702', titulo: 'Ajustes de la aplicación', descripcion: 'Configuración clave-valor (tasas de cambio, moneda base) editable desde el panel.', prioridad: 'baja', estado: 'implementado', origen: 'app_settings, src/pages/admin/settings.astro', verificacion: 'Revisión manual: cambiar una tasa y confirmar que el P&L (RF-302) la refleja.', relacionados: ['RF-302'] },
      { id: 'RF-703', titulo: 'Documentación de ingeniería', descripcion: 'Requerimientos, casos de uso, historias, diagramas UML y BPMN, kanban, guía de testing, verificación y validación, y estado del pipeline en vivo, navegables desde /docs.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/docs, src/data/documentacion.ts, testing.ts, vyv.ts, iteraciones-portfolio.ts', verificacion: 'Esta misma vista es la evidencia: los datos viven tipados en src/data/*.ts y las páginas solo los renderizan.', notas: 'Las métricas (nº de tests, cobertura, mutation score) no se escriben a mano en las páginas: salen de correr la suite y de la ingesta del pipeline, para que la documentación no pueda mentir sin que alguien lo note.', relacionados: ['RNF-14', 'CU-18', 'RF-705'] },
      { id: 'RF-705', titulo: 'Estado del pipeline en vivo', descripcion: 'Página pública que muestra el estado real de la última corrida del pipeline etapa por etapa (push, tests, e2e, build, deploy, verificación), en vez de un diagrama estático.', prioridad: 'baja', estado: 'implementado', origen: 'src/pages/docs/pipeline-en-vivo.astro, src/lib/lab/pipeline-live.ts, src/pages/api/lab/pipeline-live.ts', verificacion: 'tests/pipeline-live.test.ts cubre la normalización y el mapeo de estados, incluido el caso de la etapa de push (refleja que el evento ocurrió, no el resultado de la corrida).', relacionados: ['RF-501', 'RF-703'] },
      { id: 'RF-706', titulo: 'Diagramas BPMN de los procesos de negocio', descripcion: 'Los cuatro procesos de negocio (cobro de campo, acceso al portal de clientes, respuesta de seguridad y ciclo de monitoreo) modelados en notación BPMN con carriles por participante, compuertas, eventos y temporizadores, más la explicación de los cinco tipos de compuerta y la tabla de tiempos de cada proceso, navegables desde /docs.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/docs/diagrama-bpmn.astro, src/pages/docs/bpmn-imprimible.astro, src/data/bpmn.ts, src/lib/bpmn-layout.ts, src/components/Bpmn{Diagram,Shape}.astro, scripts/export-bpmn.mjs', verificacion: 'tests/bpmn.test.ts (83 casos) verifica la geometría, no solo que no lance: ninguna flecha atraviesa una figura ni una etiqueta ajena, ningún nodo comparte celda, ninguna etiqueta se encima con otra, toda etiqueta cabe en su figura, toda compuerta abre al menos dos ramas etiquetadas, todo evento de borde se cuelga de una tarea real, todo nodo es alcanzable desde el inicio, todo camino termina en un evento de fin y todo tiempo dibujado aparece en la tabla que cita su constante. Cada comprobación de geometría se corre en las DOS orientaciones, porque transponer cambia el ruteo y el lado de las etiquetas. Tres casos hostiles confirman que el detector no es decorativo.', notas: 'Se descartó bpmn-js (bpmn.io) para no meter ~500 KB de dependencia de UI por cuatro diagramas: el SVG se genera en el servidor desde un modelo tipado, sin JavaScript en el cliente. La verificación automática de la geometría salió cara pero se pagó sola - encontró tres flechas que cruzaban cajas, una etiqueta de compuerta encimada con la de su rama, dos ramas cuyos "sí"/"no" caían en el mismo punto (leyéndose sobre el camino contrario), una tarea sin salida en el modelo de seguridad y, al añadir los tiempos, cuatro choques más entre anotaciones y flechas. Los tiempos no se estiman: cada valor cita la constante que lo fija, y el único que no vive en el repositorio (la cadencia del cron, configurada en cron-job.org) se declara como tal. El mismo modelo se dibuja transpuesto (cada participante en una columna, el proceso bajando) para el documento de arquitectura, que es vertical: en /docs/bpmn-imprimible sobre fondo blanco y hoja A4, y exportado a SVG y PNG con "npm run bpmn:export". No es el diagrama girado, sino otro layout: la tarea se estrecha y se alarga, y la etiqueta de eventos y compuertas se va al costado porque debajo la partiría en dos la flecha de salida.', relacionados: ['RF-703', 'RF-306', 'RF-801', 'RF-603', 'RF-401'] },
      { id: 'RF-707', titulo: 'Diagramas UML de despliegue, comunicación y actividades', descripcion: 'La vista de red del sistema como diagrama de despliegue (nodos «device»/«executionEnvironment», artefactos y caminos de comunicación con protocolo), las cuatro interacciones principales como diagramas de comunicación con numeración decimal, y tres flujos de control internos como diagramas de actividades con particiones, bifurcación concurrente y bucle de reintento. Incluye la corrección de /docs/diagrama-componentes, que era un flowchart de despliegue sin ninguna interfaz declarada, a un diagrama de componentes UML real con conectores de ensamblaje.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/docs/diagrama-{despliegue,comunicacion,actividades,componentes}.astro, src/data/{despliegue,comunicacion,actividades,componentes}.ts, src/lib/uml-{deployment,communication,activity,component}.ts, src/components/uml/*.astro', verificacion: 'tests/uml-{activity,communication,deployment,component}.test.ts verifican la geometría (nada encimado, ninguna transición ni camino atravesando una figura ajena, todo elemento dentro de su nodo o partición) y también la NOTACIÓN, que es lo que un repaso visual no atrapa: toda decisión con al menos dos salidas y todas con guarda, toda unión con una sola salida, ningún nodo final con transiciones salientes, ningún nodo inalcanzable, numeración decimal sin repeticiones ni niveles huérfanos y arrancando en 1, todo camino de comunicación con su protocolo declarado, todo componente con al menos una interfaz provista o requerida, y una bola por interfaz provista en vez de una por consumidor.', notas: 'UML 2.5.1 no tiene "diagrama de red": el elemento que representa máquinas, entornos de ejecución y enlaces físicos es el de despliegue, así que se entrega como tal en vez de inventar símbolos. Mermaid quedó descartado por incapacidad, no por gusto: no tiene diagrama de comunicación ni de despliegue, y su flowchart no es notación de actividad (sin barra de bifurcación, sin particiones, sin distinguir final de flujo de final de actividad). Los tres motores de layout se escribieron reutilizando la geometría genérica del motor BPMN (corte de texto, polilíneas redondeadas, punto sobre la traza) y aportando solo lo propio de cada notación. Los diagramas de comunicación son deliberadamente las mismas cuatro interacciones del diagrama de secuencia y enlazan a él en ambos sentidos: en UML son equivalentes, y tenerlos enfrentados permite detectar que uno de los dos se quedó atrás. Un test del diagrama de componentes falla si algún componente vuelve a nombrar un proveedor de infraestructura, que es la recaída que lo tenía duplicando la vista de despliegue.', relacionados: ['RF-703', 'RF-706'] },
      { id: 'RF-708', titulo: 'Tracker de especialización técnica', descripcion: 'Panel privado que mide la práctica real sobre un stack en aprendizaje (el primero, .NET/C#): registro de sesiones con minutos, tema y bitácora; racha de días consecutivos; meta semanal de horas; temario con hitos por área; logros derivados; y mapa de calor de los últimos seis meses. Multi-track: añadir otra tecnología es una fila, no una migración.', prioridad: 'baja', estado: 'implementado', origen: 'src/pages/admin/aprendizaje.astro, src/lib/skills.ts, src/data/track-dotnet.ts, skill_tracks/skill_sessions/skill_milestones, src/pages/api/admin/skills/*', verificacion: 'tests/skills.test.ts (31 casos) sobre el módulo puro: aritmética de calendario en cambios de mes, año bisiesto y fin de año; resolución del día en la zona del tracker y no en UTC; racha con día de gracia, corte a los dos días y récord histórico; ventana de la meta semanal y ritmo necesario; niveles relativos del mapa de calor; y fechado de cada logro en el día en que se cumplió, no en el día en que se consulta.', notas: 'Distinto del Evolution Path (RF-010), que es contenido estático con checkboxes: aquí lo que se mide es el tiempo invertido. Dos decisiones de diseño: los días se guardan como clave de calendario "YYYY-MM-DD" en zona de Bogotá y no como timestamp, porque el servidor corre en UTC y una sesión registrada a las 8 de la noche caería en el día siguiente partiendo la racha; y los logros se derivan de las sesiones en cada render en vez de persistirse, porque una tabla de badges se desincroniza en cuanto se borra una sesión mal registrada. La visibilidad pública es por track y solo expone el agregado (horas, porcentaje del temario, mejor racha) en /certifications: la bitácora y los hitos individuales no salen del panel.', relacionados: ['RF-010', 'RF-006'] },
      { id: 'RF-704', titulo: 'Historial de descargas del CV', descripcion: 'Panel admin con el historial completo de descargas del CV (IP, user-agent, referer) y detección de revisitas del mismo dispositivo.', prioridad: 'baja', estado: 'implementado', origen: 'src/pages/admin/lab/cv-downloads.astro, cv_downloads', verificacion: 'Revisión manual: descargar el CV dos veces desde el mismo dispositivo y confirmar que revisits se incrementa en la fila existente en vez de duplicarla.', relacionados: ['RF-009'] },
      { id: 'RF-709', titulo: 'Informe de ejecución de pruebas', descripcion: 'La evidencia medida de la última corrida completa de la suite, publicada en /docs/ejecucion-pruebas: total de pruebas y fallos, duración por nivel (unitario contra integración), distribución logarítmica de tiempos, las 12 pruebas más lentas y la tabla de los archivos con su tiempo individual. Un generador convierte el reporte JUnit de Vitest en una instantánea versionada y, en paralelo, en un informe HTML autocontenido para entregar o proyectar.', prioridad: 'media', estado: 'implementado', origen: 'scripts/report-tests.mjs, src/data/ejecucion-pruebas.{json,ts}, src/pages/docs/ejecucion-pruebas.astro; consumido también por METRICAS_REFERENCIA, NIVELES y PIRAMIDE en src/data/testing.ts', verificacion: 'La instantánea se genera desde el XML JUnit de una corrida real (npx vitest run --reporter=junit), nunca a mano: 1181 pruebas, 0 fallos, 65.1 s. Regenerarla tras un cambio en la suite deja el diff a la vista, que es la comprobación de que la cifra publicada corresponde a una corrida que de verdad ocurrió.', notas: 'Nació de un desajuste real: /docs/testing declaraba 937 tests en 55 archivos (y su propia pirámide decía 724 unitarias contra las 777 de la tabla de niveles) cuando la suite ya iba por 1181 en 68 archivos. Eran cifras escritas a mano, justo lo que RF-703 promete que no ocurre. La corrección de fondo no fue actualizar los números sino quitarlos de las manos: ahora salen del reporte JUnit. El JSON se versiona a propósito, porque coverage/ e informes/ están en .gitignore y el build de Vercel no puede leer lo que no está en el repositorio. Del XML se guardan las 68 suites y solo los casos de las 10 de integración: los 1181 casos completos engordarían el bundle sin que la página los use. La cobertura sigue midiéndose aparte (v8) porque responde otra pregunta: qué código se ejecutó, no cuánto tardó.', relacionados: ['RF-703', 'RF-501', 'RF-507', 'RNF-14'] },
      { id: 'RF-710', titulo: 'Referencia de reportes de pruebas', descripcion: 'Página /docs/reportes-pruebas que documenta qué log emite el runner y en qué formato: los 7 reporters de Vitest (default, verbose, dot, tap-flat, junit, json, html) con la salida real de cada uno, cuáles escriben archivo y cuáles solo consola, la anatomía de un fallo en consola y en XML, y la tabla de equivalencias con el instrumental de Java (Surefire, JaCoCo, PIT).', prioridad: 'baja', estado: 'implementado', origen: 'src/data/reportes-pruebas.ts, src/pages/docs/reportes-pruebas.astro', verificacion: 'Los bloques de salida son capturas de correr cada reporter contra tests/phone.test.ts, recortadas pero no reescritas; el fallo de ejemplo se provocó de verdad alterando el valor esperado de una aserción. Que el reporter html exija @vitest/ui está documentado con el error literal que devuelve al intentarlo sin la dependencia.', notas: 'Complementa a RF-709: aquella publica el resultado de la corrida, esta explica el instrumento que lo produce. Justifica además una decisión de diseño que de otro modo parecería arbitraria: el informe se genera desde el reporter junit y no desde el html porque el XML no cuesta dependencias, lo reconoce cualquier CI y es un dato procesable que alimenta a la vez el entregable y la página de /docs; el reporter html produce una SPA para desarrollar, no un dato. La tabla de equivalencias existe porque el vocabulario estándar de pruebas viene del mundo Maven y los nombres coinciden a medias: aquí "JUnit" es un formato de archivo, no el framework que ejecuta las pruebas.', relacionados: ['RF-709', 'RF-703', 'RF-501'] },
      { id: 'RF-711', titulo: 'Diagrama de red por zonas de confianza', descripcion: 'Página /docs/diagrama-red con la topología de producción expresada como zonas de confianza (Internet, perímetro, cómputo, datos gestionados, terceros salientes), los hosts de cada una y los flujos dirigidos entre ellas, cada cruce de frontera con su protocolo, su puerto y la tabla de controles que atraviesa.', prioridad: 'media', estado: 'implementado', origen: 'src/pages/docs/diagrama-red.astro, src/data/red.ts, src/lib/red-layout.ts, src/components/uml/NetworkDiagram.astro', verificacion: 'tests/red.test.ts verifica la geometría (zonas sin solaparse, todo host dentro de su zona, ninguna traza pasando sobre un host ajeno ni atravesando una zona que no sea la de sus extremos, ningún rótulo encimado) y la NOTACIÓN, que es lo que un repaso visual no atrapa: todo flujo con protocolo, todo cruce de frontera con puerto y al menos un control declarado, ningún host aislado, y la regla dura del modelo: ningún flujo entra a una zona más confiable saltándose un nivel de perímetro, ni siquiera en el sentido de vuelta de un enlace bidireccional. Tres pruebas del motor introducen a propósito un flujo que se salta el perímetro, un cruce sin control y un host huérfano, y exigen que el verificador los detecte.', notas: 'Complementa a RF-707 sin duplicarlo y sin fingir que es UML: UML 2.5.1 no tiene vista de red, y esa carencia ya está resuelta por el lado correcto en el diagrama de despliegue. La pregunta que falta es la de operación, no la de diseño: el despliegue dice DÓNDE corre cada cosa, este dice QUÉ puede alcanzar a qué y qué lo filtra. El nivel de confianza no es decorativo, es lo que el verificador usa para decidir si una flecha es tráfico legal o un agujero descrito: por eso la pasarela de pagos aparece dos veces, saliente hacia un tercero y entrante por la puerta principal cuando devuelve el webhook, sujeta al mismo perímetro que cualquier visitante. OPSEC: solo entra lo ya público (puertos estándar, protocolos, proveedores y controles por categoría); nunca umbrales del rate limit, nombres de reglas de detección ni rutas trampa.', relacionados: ['RF-707', 'RF-703', 'RNF-24'] },
    ],
  },
]

// ── Requerimientos no funcionales (categorías ISO/IEC 25010) ────────────────
export const REQUISITOS_NO_FUNCIONALES: Modulo[] = [
  {
    id: 'seguridad-rnf',
    nombre: 'Seguridad',
    items: [
      { id: 'RNF-01', titulo: 'Cifrado de secretos en reposo', descripcion: 'Todo secreto de servicio (API keys, tokens) se almacena cifrado con AES-256-GCM; nunca en texto plano en la base de datos.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/crypto.ts', verificacion: 'Inspección directa de la base de datos: el valor almacenado es ciphertext, no el secreto original.', notas: 'La clave de cifrado (ENCRYPTION_KEY) vive fuera del repo, en variables de entorno; sin ella, el guardado de secretos falla en vez de degradar a texto plano.', relacionados: ['RF-303', 'RF-304'] },
      { id: 'RNF-02', titulo: 'Autorización por allowlist', descripcion: 'Solo los logins de GitHub explícitamente permitidos obtienen sesión de administrador, sin excepción.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/auth.ts', verificacion: 'Probado con un login de GitHub real fuera de la allowlist, confirmando el rechazo.', notas: 'La allowlist es la única fuente de autorización; no hay roles ni permisos granulares porque el panel tiene un único administrador.', relacionados: ['RF-101', 'RF-102'] },
      { id: 'RNF-03', titulo: 'Fail-open en enforcement de seguridad', descripcion: 'Cualquier fallo en blocklist, rate limiting o sensor deja pasar el request; el enforcement nunca puede tumbar el sitio.', prioridad: 'alta', estado: 'implementado', origen: 'src/middleware.ts', verificacion: 'Probado simulando un timeout de base de datos en la lectura de blocklist/chaos flags y confirmando que el request pasa igual.', notas: 'Decisión deliberada: un bug propio en el motor de seguridad no debe convertirse en una autocaída del sitio.', relacionados: ['RF-602', 'RF-503'] },
      { id: 'RNF-04', titulo: 'Sin bloqueos eternos', descripcion: 'Todo bloqueo de IP y todo chaos flag tiene TTL obligatorio; el sistema se autocorrige sin intervención manual.', prioridad: 'media', estado: 'implementado', origen: 'blocked_ips.expiresAt, chaos_flags.expiresAt', verificacion: 'Validado esperando el TTL de un bloqueo de prueba y confirmando que expira solo.', relacionados: ['RF-602', 'RF-503'] },
      { id: 'RNF-05', titulo: 'Minimización de PII en la vitrina pública', descripcion: 'La IP se enmascara/hashea antes de exponerse fuera del panel admin; Web Vitals no capturan datos personales.', prioridad: 'media', estado: 'implementado', origen: 'security_events.ipHash', verificacion: 'Revisión manual del payload de Web Vitals y de las vistas públicas confirmando ausencia de IP en claro.', relacionados: ['RF-405'] },
      { id: 'RNF-20', titulo: 'Los guardas de ruta son ciegos al idioma', descripcion: 'Ningún clasificador de ruta (rate limiting, bloqueo en modo demo, gate de admin, portal) puede cambiar de veredicto porque la URL lleve un prefijo de idioma delante.', prioridad: 'alta', estado: 'implementado', origen: 'src/i18n/routing.ts (delocalizePath, isLocalizedPrivateRequest), src/middleware.ts', verificacion: '141 tests en tests/i18n-routing-guards.test.ts que recorren cada guarda de src/lib/security/paths.ts y src/lib/demo.ts afirmando el mismo veredicto para /x y /en/x, más casos adversariales del prefijo (//en/admin, /EN/admin, /e%6E/admin, /english/algo).', notas: 'Es el riesgo real de internacionalizar este sitio: los guardas comparan rutas literales, así que una ruta /en/admin sin normalizar habría sido una copia del panel sin vigilancia. El middleware normaliza el pathname una sola vez, antes de cualquier clasificación, y las rutas privadas (admin, API, portal, cobros y los tres gates de login) devuelven 404 bajo cualquier prefijo de idioma en vez de normalizarse y servirse.', relacionados: ['RF-013', 'RNF-02', 'RNF-10'] },
    ],
  },
  {
    id: 'confiabilidad',
    nombre: 'Confiabilidad y disponibilidad',
    items: [
      { id: 'RNF-06', titulo: 'Idempotencia de pagos', descripcion: 'Un mismo idempotencyKey nunca genera dos cobros, incluso ante doble clic o reintento de red.', prioridad: 'alta', estado: 'implementado', origen: 'payments.idempotencyKey', verificacion: 'Test de integración enviando dos requests de cobro con la misma key y confirmando un solo payment creado.', relacionados: ['RF-502', 'CU-12'] },
      { id: 'RNF-07', titulo: 'Máquina de estados sin retrocesos', descripcion: 'Los estados terminales de un pago (approved/declined/error/voided) nunca retroceden ante webhooks fuera de orden.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/payments.ts', verificacion: 'Test enviando un webhook "pending" después de uno "approved" y confirmando que el estado terminal se conserva (outOfOrder=true).', relacionados: ['RF-502', 'CU-12'] },
      { id: 'RNF-08', titulo: 'Rollback automático de deploy', descripcion: 'Si el health check post-deploy falla, el pipeline revierte automáticamente a la última versión saludable.', prioridad: 'alta', estado: 'implementado', origen: 'ci_runs.healthOk', verificacion: 'Validado en el LAB forzando un health check fallido y observando el rollback en ci_runs.', relacionados: ['RF-501'] },
      { id: 'RNF-09', titulo: 'Objetivo de disponibilidad (SLO)', descripcion: 'Cada servicio monitoreado puede evaluarse contra un objetivo configurable (por defecto 99.5% en ventana de 30 días).', prioridad: 'media', estado: 'implementado', origen: 'src/lib/slo.ts', verificacion: 'Contraste manual del error budget calculado contra el uptime real de un monitor en producción.', relacionados: ['RF-403'] },
      { id: 'RNF-10', titulo: 'Rate limiting resistente a redeploys', descripcion: 'El estado del limitador de tasa persiste en base de datos, no se resetea con cada despliegue.', prioridad: 'media', estado: 'implementado', origen: 'rate_limit_buckets', verificacion: 'Validado comparando el conteo antes/después de un redeploy en producción.', notas: 'Reemplazó una implementación previa en memoria que perdía el estado en cada redeploy de Vercel.', relacionados: ['RF-603'] },
      { id: 'RNF-26', titulo: 'Las páginas públicas sobreviven a una base caída', descripcion: 'Una consulta que falla en una página pública pinta el dato como ausente, nunca como error ni como 404: la portada, /status, /security, /certifications y /engineering siguen sirviendo su contenido aunque la base de datos no responda.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/safe-query.ts, usado en src/pages/index.astro, status.astro, security.astro, certifications.astro y engineering.astro', verificacion: 'Revisión exhaustiva de las cinco páginas públicas con datos: las 23 consultas pasan por safeQuery con su valor de reemplazo, sin ninguna consulta desnuda que pueda propagar la excepción al render. Cada fallo se registra en el log del servidor con su etiqueta, así que degradar en la cara del visitante no significa degradar en silencio para quien opera el sitio.', notas: 'El incidente que lo motivó (10 ago 2026): agotada la cuota de lecturas de Turso, la portada devolvía 404 por UNA consulta de proyectos, cuando la mayor parte de lo que muestra ni siquiera sale de la base. Extiende al render público el fail-open que ya regía en seguridad y observabilidad (RNF-03). Deliberadamente NO se usa en el panel, el portal ni en nada que cobre o autentique: ahí un dato que falta en silencio es peor que un error visible.', relacionados: ['RNF-03', 'RNF-25', 'RF-004'] },
      { id: 'RNF-27', titulo: 'Datos reales desde fuentes alternas con la base caída', descripcion: 'Cuando la base de datos no responde, las páginas públicas no se limitan a omitir el dato (RNF-26): lo sirven desde una fuente alterna real. La portada pinta los proyectos desde una instantánea capturada de la propia base, y /status mide la disponibilidad y la latencia sondeando los endpoints públicos en el momento del render, sin base de datos de por medio.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/fallback/ (rastreador.ts, instantanea.ts, sondeo-vivo.ts), src/data/instantanea.json, src/data/respaldo-monitores.ts, scripts/capturar-instantanea.mjs', verificacion: 'tests/fallback.test.ts (15 casos): el rastreador devuelve el respaldo y marca la degradación sin propagar la excepción, dos rastreadores no comparten estado (Fluid Compute reutiliza instancias entre requests concurrentes), la instantánea no filtra campos privados al bundle público, y el sondeo reporta caída tanto ante un error de red como ante un 500. Verificado en vivo: con TURSO_DATABASE_URL apuntando a un puerto cerrado, /, /status, /engineering, /certifications, /security y sus versiones /en responden 200; la portada sirve los 13 proyectos reales y /status mide y publica la latencia de cada endpoint.', notas: 'Es la evolución de RNF-26: sobrevivir a la base caída ya no significa mostrar huecos. La distinción de diseño está en qué se guarda: la instantánea guarda DESTINOS y datos curados, que no caducan; nunca MEDICIONES, que sí. Por eso /status no repite la última latencia conocida, la vuelve a medir. La página declara el modo respaldo explícitamente y dice qué no puede mostrar (historial de 90 días y presupuesto de error, que sí salen de la base): degradar con datos reales no autoriza a presentarlos como si fueran lo mismo que el histórico. Se apaga sola: cuando la base vuelve a responder no hay bandera que desactivar ni cambio que revertir.', relacionados: ['RNF-26', 'RNF-03', 'RF-401'] },
      { id: 'RNF-28', titulo: 'Los crons declarados son verificables sin desplegar', descripcion: 'Toda ruta declarada en la sección de crons de vercel.json existe como archivo, exporta un handler GET, comprueba CRON_SECRET y no cuelga del gate de sesión de /api/admin.', prioridad: 'alta', estado: 'implementado', origen: 'vercel.json (crons), tests/crons.test.ts', verificacion: 'tests/crons.test.ts recorre cada entrada de vercel.json y afirma las cuatro condiciones; falla en CI antes del deploy si alguna se rompe.', notas: 'Escrito después de que el backup pasara un mes sin producir un solo archivo (RF-701): la ruta existía, pero su GET era el de "listar" y vivía bajo /api/admin/, así que el cron se llevaba un 302 y Vercel lo pintaba en verde. Las cuatro condiciones que comprueba el test son exactamente las que fallaban, y ninguna necesita desplegar ni llamar a nadie para comprobarse.', relacionados: ['RF-701', 'RNF-08'] },
    ],
  },
  {
    id: 'rendimiento',
    nombre: 'Eficiencia de desempeño',
    items: [
      { id: 'RNF-11', titulo: 'Latencia del sensor de seguridad', descripcion: 'La clasificación de cada request (regex/lookup en memoria) no debe añadir latencia perceptible; la escritura es fire-and-forget.', prioridad: 'alta', estado: 'implementado', origen: 'src/lib/security/sensor.ts', verificacion: 'Medición manual de tiempos de respuesta con y sin el sensor activo; sin diferencia perceptible.', relacionados: ['RF-601'] },
      { id: 'RNF-12', titulo: 'Core Web Vitals dentro de "good"', descripcion: 'LCP, INP y CLS del sitio público deben mantenerse en la banda "good" según el p75 medido en producción.', prioridad: 'media', estado: 'parcial', origen: 'web_vitals', notas: 'La captura RUM (RF-405) ya está en producción; falta consolidar el p75 histórico como badge visible y accionar sobre páginas que no cumplan.', relacionados: ['RF-405'] },
      { id: 'RNF-13', titulo: 'Cache de lecturas frecuentes', descripcion: 'Blocklist y flags de chaos se leen con cache en memoria (30s) para no golpear la base de datos en cada request.', prioridad: 'media', estado: 'implementado', origen: 'src/lib/security/blocklist.ts', verificacion: 'Revisión de logs de queries confirmando que no hay una consulta a blocklist por cada request.', relacionados: ['RF-602', 'RF-503'] },
    ],
  },
  {
    id: 'mantenibilidad',
    nombre: 'Mantenibilidad',
    items: [
      { id: 'RNF-14', titulo: 'Datos de documentación como código', descripcion: 'Requerimientos, casos de uso e iteraciones se definen en TypeScript tipado, no en documentos externos desincronizables.', prioridad: 'media', estado: 'implementado', origen: 'src/data/documentacion.ts', verificacion: 'Verificado por el propio compilador: cualquier campo faltante o mal tipado rompe `astro check`.', relacionados: ['RF-703'] },
      { id: 'RNF-15', titulo: 'Registro de decisiones de arquitectura', descripcion: 'Cada decisión técnica relevante por proyecto queda documentada con contexto, alternativas y consecuencias (ADR).', prioridad: 'media', estado: 'implementado', origen: 'project_adrs', verificacion: 'Revisión manual del ADR más reciente de un proyecto activo.', relacionados: ['RF-207'] },
      { id: 'RNF-22', titulo: 'Entorno de desarrollo reproducible en contenedor', descripcion: 'El entorno de desarrollo (Node 22.12, navegador de Playwright, bases de datos) se define como código en un devcontainer, de modo que clonar el repositorio y abrirlo produce el mismo entorno en cualquier máquina.', prioridad: 'media', estado: 'implementado', origen: '.devcontainer/ (Dockerfile, compose.yaml, devcontainer.json), compose.yaml', verificacion: 'La imagen construye y se comprobó su contenido: Node v22.12.0 exacto, usuario no-root (uid 1000) y Chromium 1228 de Playwright preinstalado. `docker compose config` valida ambas composiciones.', notas: 'Docker aquí NO es el runtime de producción y no debe llegar a serlo: el sitio lo construye y ejecuta Vercel, y contenerizarlo perdería edge, preview deploys y el rollback automático de ci.yml. Resuelve un fallo concreto y documentado: un Node 20 suelto en el PATH rompe `astro build`. Las imágenes van pineadas por digest y no por tag, porque una reproducibilidad que depende de que nadie mueva `latest` no es reproducibilidad. Los contenedores corren con `cap_drop: ALL` y solo las cuatro capacidades que se midieron como imprescindibles.', relacionados: ['RNF-23'] },
      { id: 'RNF-23', titulo: 'Pruebas de integración contra libSQL real', descripcion: 'La suite e2e puede ejecutarse contra un servidor libSQL (sqld) en contenedor además de contra bases en archivo, ejerciendo el mismo protocolo HTTP/hrana que Turso en producción.', prioridad: 'media', estado: 'implementado', origen: 'compose.yaml, playwright.config.ts (E2E_DB_MODE), scripts/wait-libsql.mjs, scripts/seed-e2e.mjs', verificacion: 'Las migraciones de Drizzle y el sembrador completo corren sin un solo cambio de código contra sqld en contenedor (51 tablas migradas, 4320 checks sembrados por HTTP); la suite arranca y ejecuta en ese modo.', notas: 'El modo por archivo sigue siendo el predeterminado a propósito: obligar a levantar contenedores para correr los e2e sería cambiar un test que funciona por uno que además hay que administrar. El valor del modo servidor está en los tests que dependen de transacciones, UNIQUE y concurrencia (pagos y aislamiento del portal), donde una base en archivo no ejerce la misma semántica que la real. El sembrador solo acepta destinos locales mediante lista blanca: arrasa el esquema antes de sembrar, así que un error de configuración no degradaría una prueba, borraría una base.', relacionados: ['RNF-22', 'RNF-17'] },
      { id: 'RNF-24', titulo: 'Separación de niveles de autoridad verificable', descripcion: 'Las decisiones de publicar, revertir y ejecutar están separadas en tres niveles de autoridad, y cada frontera se sostiene en un mecanismo del repositorio, no en la disciplina de quien programa. La matriz RACI de las actividades críticas es un dato tipado con sus reglas comprobadas en CI.', prioridad: 'media', estado: 'implementado', origen: 'src/data/gobernanza.ts, src/lib/gobernanza-estilos.ts, src/pages/docs/roles.astro, src/pages/docs/raci.astro; mecanismos: .github/workflows/ci.yml (health check + rollback), regla de deploys en CLAUDE.md, allowlist en src/middleware.ts, política de migraciones aditivas en drizzle/', verificacion: 'tests/gobernanza.test.ts (9 pruebas): un solo aprobador y al menos un responsable por actividad, tres niveles sin duplicados, ningún nivel omitido por descuido y toda fila con su justificación y su evidencia.', notas: 'La prueba encontró de verdad lo que buscaba: cuatro filas de la matriz inicial incumplían las reglas (dos con aprobador pero sin ejecutor, dos sin aprobador). Lo que NO se puede afirmar: al ocupar una sola persona los tres niveles, la separación protege contra el error, la prisa y el olvido, no contra alguien que decida saltársela; eso último exige independencia organizacional, que este proyecto no tiene (misma limitación que ya declara el nivel de integridad 4 en V&V).', relacionados: ['RNF-14', 'RF-703'] },
      { id: 'RNF-16', titulo: 'Retención y purga de datos operativos', descripcion: 'Los checks de monitoreo y eventos de seguridad crudos se purgan pasados 90 días para no inflar el almacenamiento.', prioridad: 'baja', estado: 'implementado', origen: 'monitor_checks, security_events', verificacion: 'Revisión del job de purga y del volumen de la tabla antes/después de su ejecución.', notas: 'Los rollups agregados (RF-604) sobreviven la purga; solo se elimina el detalle crudo, para conservar tendencias históricas sin el peso de cada evento individual.', relacionados: ['RF-604'] },
      { id: 'RNF-25', titulo: 'Coste de lectura acotado en las páginas públicas', descripcion: 'El coste en filas leídas de una página pública no crece con la antigüedad del sistema: /status lee un resumen diario precalculado (una fila por monitor y día, ~720) más el día en curso, en vez de agregar los 90 días crudos de monitor_checks en cada render. Las pruebas de carga se niegan a arrancar si el objetivo está conectado a una base remota.', prioridad: 'alta', estado: 'implementado', origen: 'monitor_daily, src/lib/monitor-rollup.ts, src/pages/api/cron/monitor-rollup.ts, src/pages/status.astro, src/lib/db-target.ts, lab/k6/lib/perfil.js', verificacion: 'tests/monitor-rollup.test.ts (histograma, percentil y agregación por día UTC) y tests/db-target.test.ts (detección de base local). Medido contra la sqld local: 5.912 filas recorridas por render antes, 552 después, con el p95 aproximado dentro del 7,4% del exacto que devolvía la window function.', notas: 'El incidente que lo motivó (ago 2026): una corrida de k6 contra localhost, pero con el dev server leyendo de la Turso de producción, agotó los 7.500 millones de filas de la cuota. Las dos causas se arreglan por separado porque son independientes: el volumen por render (que en producción tapaba el cache de 300s del CDN, hasta que llegó tráfico sin CDN por delante) y el que una prueba de carga pudiera alcanzar la base real. Los contadores del resumen son exactos y aditivos; la latencia no, porque un percentil no se suma, así que cada día guarda además un histograma de 32 cubos casi geométricos del que sale el p95 de la ventana. La escalera de cubos es geométrica y no lineal porque en un percentil importa el error relativo: la primera versión, lineal, pintaba 2450 ms un p95 real de 2030.', relacionados: ['RNF-16', 'RF-004', 'RF-401', 'RNF-22'] },
    ],
  },
  {
    id: 'usabilidad',
    nombre: 'Usabilidad y accesibilidad',
    items: [
      { id: 'RNF-17', titulo: 'Panel operable desde móvil', descripcion: 'El panel admin y sus subpáginas son usables en viewport móvil (drawer de navegación colapsable).', prioridad: 'media', estado: 'implementado', origen: 'src/layouts/AdminLayout.astro', verificacion: 'Probado manualmente en viewport móvil real (el administrador opera el panel desde el celular para acciones rápidas).' },
      { id: 'RNF-18', titulo: 'Auditoría de accesibilidad automatizada', descripcion: 'Cada push corre axe-core sobre Playwright contra las 8 páginas públicas y reporta las violaciones al panel del LAB como hallazgos rastreables.', prioridad: 'media', estado: 'implementado', origen: 'scripts/a11y-scan.mjs, .github/workflows/a11y.yml', verificacion: 'La primera corrida encontró 9 violaciones reales de contraste WCAG AA (ratios de 2.4-2.95 contra el mínimo 4.5:1), no artefactos del entorno de prueba.', relacionados: ['RF-506', 'RNF-19'] },
      { id: 'RNF-19', titulo: 'Navegación por teclado y anuncios en el portal', descripcion: 'El portal de clientes ofrece salto al contenido, región aria-live para el resultado de las acciones y devolución explícita del foco tras enviar un formulario.', prioridad: 'media', estado: 'implementado', origen: 'src/layouts/PortalLayout.astro', verificacion: 'Recorrido manual con teclado y lector de pantalla: el skip link es el primer tabulable, el resultado del envío se anuncia (incluidos los errores) y el foco aterriza en la confirmación.', notas: 'La región viva anuncia también los fallos, no solo el camino feliz: un formulario que "no dice nada" al fallar es peor para un lector de pantalla que uno que no valida.', relacionados: ['RNF-18'] },
      { id: 'RNF-21', titulo: 'Paridad de traducciones verificable', descripcion: 'Una clave añadida al diccionario español sin su par en inglés rompe el type-check, y ningún hreflang ni entrada de sitemap apunta a una URL traducida que no exista.', prioridad: 'media', estado: 'implementado', origen: 'src/i18n/en.ts (satisfies typeof es), src/i18n/routing.ts (TRANSLATED_ROUTES, translatedAlternates)', verificacion: 'npx astro check limpio + tests/i18n-dictionary.test.ts (claves huérfanas, valores EN idénticos al ES) y tests/i18n-routing.test.ts, que cruza TRANSLATED_ROUTES contra los archivos reales de src/pages/en/.', notas: 'Anunciar hreflang="en" hacia una URL que devuelve 404 es peor que no anunciarlo: por eso los alternates se emiten solo para los idiomas en los que la página existe de verdad. El atributo lang correcto también es criterio WCAG 3.1.1 - contenido inglés bajo lang="es" es una violación real, no cosmética.', relacionados: ['RF-013', 'RF-007', 'RNF-18'] },
    ],
  },
]

// ── Actores ──────────────────────────────────────────────────────────────────
export interface Actor {
  id: string
  nombre: string
  descripcion: string
}

export const ACTORES: Actor[] = [
  { id: 'visitante', nombre: 'Visitante público', descripcion: 'Cualquier persona que navega el sitio público sin autenticarse: recluta, cliente potencial, buscador.' },
  { id: 'admin', nombre: 'Administrador (Mike)', descripcion: 'Único usuario con acceso al panel /admin, autenticado con GitHub OAuth vía allowlist.' },
  { id: 'cliente', nombre: 'Cliente', descripcion: 'Persona de negocio de un proyecto gestionado. Entra al portal con cuenta propia (facturas, documentos, mensajes, avance) y además recibe links de cobro y presentaciones compartidas sin necesidad de sesión.' },
  { id: 'cron', nombre: 'Cron externo (cron-job.org / Vercel Cron)', descripcion: 'Disparador automático periódico que golpea endpoints de sondeo, backup y rollups.' },
  { id: 'gateway', nombre: 'Pasarela de pagos (Wompi)', descripcion: 'Sistema externo que envía webhooks de eventos de pago.' },
  { id: 'buscador', nombre: 'Buscador (Google/Bing)', descripcion: 'Rastreador que consume sitemap, RSS y recibe notificaciones IndexNow.' },
]

// ── Casos de uso ──────────────────────────────────────────────────────────────
export interface NodoRelacionadoCU {
  id: string
  nombre: string
}
export interface RelacionCU {
  tipo: 'include' | 'extends'
  nodo: NodoRelacionadoCU
  despues?: string // id del nodo previo en la cadena de <<include>>; por defecto, el propio caso de uso
}
export interface CasoDeUso {
  id: string
  nombre: string
  actor: string // id de ACTORES
  rf: string[] // ids de requerimientos funcionales relacionados
  resumen: string
  relaciones?: RelacionCU[] // <<include>>/<<extends>> hacia otros casos de uso o pasos compartidos
}

export const CASOS_DE_USO: CasoDeUso[] = [
  { id: 'CU-01', nombre: 'Explorar proyectos públicos', actor: 'visitante', rf: ['RF-001', 'RF-002'], resumen: 'El visitante navega el listado de proyectos y entra al detalle de uno.' },
  { id: 'CU-02', nombre: 'Enviar mensaje de contacto', actor: 'visitante', rf: ['RF-003'], resumen: 'El visitante completa el formulario de contacto y el mensaje queda en la bandeja del CRM.' },
  { id: 'CU-03', nombre: 'Consultar estado del sistema', actor: 'visitante', rf: ['RF-004'], resumen: 'El visitante revisa uptime, incidentes activos y latencia en tiempo real de los servicios.' },
  { id: 'CU-04', nombre: 'Iniciar sesión como administrador', actor: 'admin', rf: ['RF-101', 'RF-102'], resumen: 'El administrador se autentica con GitHub y accede al panel si su login está en la allowlist.', relaciones: [
    { tipo: 'extends', nodo: { id: 'CU-04-X1', nombre: 'Rechazar login fuera de la allowlist' } },
  ] },
  { id: 'CU-05', nombre: 'Gestionar sesiones de dispositivo', actor: 'admin', rf: ['RF-103'], resumen: 'El administrador revisa dispositivos con sesión activa y revoca los que no reconoce.' },
  { id: 'CU-06', nombre: 'Registrar y dar seguimiento a un proyecto', actor: 'admin', rf: ['RF-201', 'RF-204', 'RF-207'], resumen: 'El administrador crea un proyecto, registra interacciones de seguimiento y documenta decisiones de arquitectura.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-06-N1', nombre: 'Registrar interacción de seguimiento' } },
    { tipo: 'include', nodo: { id: 'CU-06-N2', nombre: 'Documentar decisión de arquitectura (ADR)' }, despues: 'CU-06-N1' },
    { tipo: 'extends', nodo: { id: 'CU-06-X1', nombre: 'Publicar ADR en vitrina pública' } },
  ] },
  { id: 'CU-07', nombre: 'Elaborar un briefing de cliente', actor: 'admin', rf: ['RF-205'], resumen: 'El administrador documenta objetivo, alcance, presupuesto e ítems de un proyecto antes de iniciarlo.' },
  { id: 'CU-08', nombre: 'Registrar costos y calcular P&L', actor: 'admin', rf: ['RF-302', 'RF-303'], resumen: 'El administrador registra el costo de un servicio, quién lo paga y cuánto se factura al cliente.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-08-N1', nombre: 'Calcular P&L del proyecto' } },
    { tipo: 'extends', nodo: { id: 'CU-08-X1', nombre: 'Excluir costo sin tasa de cambio' } },
  ] },
  { id: 'CU-09', nombre: 'Recibir alerta de monitor caído', actor: 'cron', rf: ['RF-401', 'RF-402', 'RF-404'], resumen: 'El cron externo dispara el chequeo, detecta una caída, abre un incidente y notifica por push.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-09-N1', nombre: 'Abrir incidente' } },
    { tipo: 'include', nodo: { id: 'CU-09-N2', nombre: 'Notificar caída por push' }, despues: 'CU-09-N1' },
    { tipo: 'extends', nodo: { id: 'CU-09-X1', nombre: 'Cerrar incidente por recuperación' } },
    { tipo: 'extends', nodo: { id: 'CU-09-X2', nombre: 'Marcar degradación por latencia' } },
  ] },
  { id: 'CU-10', nombre: 'Evaluar SLO de un servicio', actor: 'admin', rf: ['RF-403'], resumen: 'El administrador define objetivo y ventana, y consulta el presupuesto de error restante de un monitor.' },
  { id: 'CU-11', nombre: 'Ejecutar backup manual', actor: 'admin', rf: ['RF-701'], resumen: 'El administrador dispara un backup de la base de datos hacia Blob storage desde el panel.', relaciones: [
    { tipo: 'extends', nodo: { id: 'CU-11-X1', nombre: 'Backup automático por cron' } },
  ] },
  { id: 'CU-12', nombre: 'Procesar un pago con idempotencia', actor: 'gateway', rf: ['RF-502'], resumen: 'La pasarela envía un webhook de pago; el sistema aplica el evento respetando idempotencia y orden.', relaciones: [
    { tipo: 'extends', nodo: { id: 'CU-12-X1', nombre: 'Registrar evento duplicado' } },
    { tipo: 'extends', nodo: { id: 'CU-12-X2', nombre: 'Registrar evento fuera de orden' } },
  ] },
  { id: 'CU-13', nombre: 'Inyectar un fallo de chaos engineering', actor: 'admin', rf: ['RF-503'], resumen: 'El administrador activa un flag de fallo temporal en una ruta y observa cómo el monitoreo lo detecta.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-13-N1', nombre: 'Aplicar fallo simulado en middleware' } },
    { tipo: 'extends', nodo: { id: 'CU-13-X1', nombre: 'Desactivar todos los flags (botón de pánico)' } },
  ] },
  { id: 'CU-14', nombre: 'Bloquear una IP maliciosa', actor: 'admin', rf: ['RF-601', 'RF-602'], resumen: 'El sensor clasifica un request hostil; el administrador (o el auto-block) añade la IP a la blocklist con TTL.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-14-N1', nombre: 'Registrar evento de seguridad' } },
    { tipo: 'extends', nodo: { id: 'CU-14-X1', nombre: 'Bloquear IP manualmente' } },
  ] },
  { id: 'CU-15', nombre: 'Aplicar rate limiting durable', actor: 'admin', rf: ['RF-603'], resumen: 'Un cliente excede el límite de requests permitido; el sistema lo limita usando el estado persistido en base de datos.' },
  { id: 'CU-16', nombre: 'Proyectar una presentación con el público en sincronía', actor: 'cliente', rf: ['RF-208'], resumen: 'El administrador proyecta un deck y lo controla desde su celular; el público lo sigue en sus propios dispositivos entrando por un QR o un PIN de cuatro caracteres.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-16-N1', nombre: 'Generar PIN libre de colisiones' } },
    { tipo: 'include', nodo: { id: 'CU-16-N2', nombre: 'Sincronizar slide por pub/sub' } },
    { tipo: 'extends', nodo: { id: 'CU-16-X1', nombre: 'Recoger feedback del público al cerrar' } },
  ] },
  { id: 'CU-17', nombre: 'Indexar contenido nuevo en buscadores', actor: 'buscador', rf: ['RF-007'], resumen: 'Al publicar contenido, el sistema notifica vía IndexNow y actualiza el RSS/sitemap para acelerar la indexación.' },
  { id: 'CU-19', nombre: 'Consultar el sitio en inglés', actor: 'visitante', rf: ['RF-013', 'RF-014'], resumen: 'El visitante internacional cambia de idioma desde cualquier página y sigue en la misma página, ahora en inglés.', relaciones: [
    { tipo: 'extends', nodo: { id: 'CU-19-X1', nombre: 'Sugerir inglés según el idioma del navegador' } },
    { tipo: 'extends', nodo: { id: 'CU-19-X2', nombre: 'Devolver la versión en español si la página no está traducida' } },
  ] },
  { id: 'CU-18', nombre: 'Consultar documentación del proyecto', actor: 'admin', rf: ['RF-703'], resumen: 'El administrador navega /docs para revisar requerimientos, casos de uso, diagramas y el kanban del propio portfolio.', relaciones: [
    { tipo: 'include', nodo: { id: 'CU-18-N1', nombre: 'Navegar subpágina de documentación' } },
    { tipo: 'extends', nodo: { id: 'CU-18-X1', nombre: 'Consultar diagrama Mermaid' } },
  ] },
]

// ── Casos de uso extendidos ───────────────────────────────────────────────────
export interface CasoDeUsoExtendido {
  id: string // referencia a CASOS_DE_USO
  precondiciones: string[]
  flujoPrincipal: string[]
  flujosAlternos: { titulo: string; pasos: string[] }[]
  excepciones: string[]
  postcondiciones: string[]
}

export const CASOS_DE_USO_EXTENDIDOS: CasoDeUsoExtendido[] = [
  {
    id: 'CU-04',
    precondiciones: ['El administrador tiene una cuenta de GitHub válida.', 'Su login está registrado en la allowlist de src/lib/auth.ts.'],
    flujoPrincipal: [
      'El administrador visita /admin sin sesión activa.',
      'El middleware detecta ausencia de sesión y redirige a /api/auth/signin.',
      'El administrador autoriza la app OAuth de GitHub.',
      'Auth.js valida el login contra la allowlist.',
      'Se emite un JWT de sesión y se registra el dispositivo en admin_sessions.',
      'El administrador es redirigido al panel /admin.',
    ],
    flujosAlternos: [
      { titulo: 'Login no autorizado', pasos: ['GitHub autentica correctamente pero el login no está en la allowlist.', 'Auth.js rechaza la sesión y muestra error de acceso denegado.'] },
    ],
    excepciones: ['GitHub OAuth no disponible: el login falla con mensaje de error genérico, sin exponer detalles internos.'],
    postcondiciones: ['El administrador tiene una sesión JWT activa y un registro en admin_sessions con IP y user-agent.'],
  },
  {
    id: 'CU-09',
    precondiciones: ['Existe un monitor activo y no pausado en la tabla monitors.', 'El cron externo tiene configurado el CRON_SECRET válido.'],
    flujoPrincipal: [
      'El cron externo llama a /api/cron/uptime-check con el secreto.',
      'El sistema itera los monitores activos y hace la petición HTTP configurada (método, texto esperado, umbral de latencia).',
      'La respuesta falla (status inesperado, timeout o texto ausente).',
      'Se inserta un monitor_check con ok=false.',
      'Si es el primer fallo consecutivo, se abre un monitor_incidents con startedAt.',
      'Se actualiza monitors.lastStatus a "down" y se dispara una notificación push (ntfy).',
    ],
    flujosAlternos: [
      { titulo: 'Recuperación', pasos: ['Un chequeo posterior tiene éxito.', 'Se cierra el incidente abierto con resolvedAt y durationSec.', 'Se notifica la recuperación.'] },
      { titulo: 'Degradación por latencia', pasos: ['La respuesta es exitosa pero supera latencyThresholdMs.', 'lastStatus pasa a "degraded" sin abrir incidente.'] },
    ],
    excepciones: ['El endpoint del monitor no responde en absoluto (timeout de red): se registra como fallo con error de timeout.'],
    postcondiciones: ['El estado materializado del monitor refleja el último chequeo; el historial permite reconstruir el SLO.'],
  },
  {
    id: 'CU-12',
    precondiciones: ['Existe un payment en estado created o pending con un idempotencyKey único.'],
    flujoPrincipal: [
      'La pasarela (Wompi) envía un webhook con el resultado de la transacción.',
      'El sistema busca el payment por reference/gatewayTxId.',
      'Se registra el evento crudo en payment_events (incluyendo si es duplicado o fuera de orden).',
      'Si el evento es válido y en orden, se aplica la transición de estado (created→pending→approved/declined).',
      'Se responde 200 a la pasarela para confirmar recepción.',
    ],
    flujosAlternos: [
      { titulo: 'Evento duplicado', pasos: ['El gatewayTxId ya fue procesado.', 'Se marca duplicate=true en payment_events.', 'No se modifica el estado del payment.'] },
      { titulo: 'Evento fuera de orden', pasos: ['Llega un evento "pending" después de uno "approved".', 'Se marca outOfOrder=true.', 'El estado terminal previo se conserva (nunca retrocede).'] },
    ],
    excepciones: ['El monto del evento no coincide con el del payment: se marca amountMismatch=true y se genera una alerta; el evento nunca se aplica.'],
    postcondiciones: ['El estado del payment refleja fielmente la transacción real, con bitácora completa auditable para sustentación.'],
  },
  {
    id: 'CU-14',
    precondiciones: ['El sensor de seguridad (sensor.ts) está observando requests entrantes.'],
    flujoPrincipal: [
      'Llega un request al middleware.',
      'observeRequest clasifica el request contra las firmas conocidas (classify.ts).',
      'Se detecta una firma de severidad alta/crítica (p. ej. intento de path traversal).',
      'Se registra un security_events con category, severity y ruleId.',
      'El cron de auto-block evalúa la reincidencia de esa IP y decide bloquearla con TTL escalonado (1h → 24h → 7d).',
      'La IP queda en blocked_ips con expiresAt obligatorio.',
    ],
    flujosAlternos: [
      { titulo: 'Bloqueo manual', pasos: ['El administrador revisa un evento en el panel y decide bloquear la IP manualmente.', 'Se inserta en blocked_ips con source=manual.'] },
    ],
    excepciones: ['La lectura de blocklist falla (timeout de DB): el middleware falla abierto y deja pasar el request (nunca bloquea por error interno).'],
    postcondiciones: ['Requests posteriores de esa IP reciben 403 seco hasta que expire el bloqueo.'],
  },
  {
    id: 'CU-18',
    precondiciones: ['El administrador tiene sesión activa en /admin.'],
    flujoPrincipal: [
      'El administrador hace clic en "Documentación" en la sidebar.',
      'Se muestra el hub /docs con visión general, alcance y mapa de subpáginas.',
      'El administrador navega a una subpágina (RF, RNF, CU, diagramas o kanban) usando DocsNav.',
      'La página renderiza el contenido desde src/data/documentacion.ts o src/data/iteraciones-portfolio.ts.',
    ],
    flujosAlternos: [
      { titulo: 'Consulta de diagrama Mermaid', pasos: ['El administrador entra a una página de diagrama de secuencia, clases u objetos.', 'El navegador renderiza el diagrama Mermaid desde el texto embebido en la página.'] },
      { titulo: 'Consulta de diagrama con motor propio', pasos: ['El administrador entra a una página de diagrama BPMN, de despliegue, de comunicación, de actividades o de componentes.', 'El servidor genera el SVG desde el modelo tipado de src/data/ con el motor de layout correspondiente de src/lib/; el navegador no ejecuta JavaScript para dibujarlo.'] },
    ],
    excepciones: [],
    postcondiciones: ['El administrador cuenta con la documentación de ingeniería completa del proyecto sin salir del panel.'],
  },
  {
    id: 'CU-06',
    precondiciones: ['El administrador tiene sesión activa.', 'Opcionalmente existe un cliente en la tabla clients al que asociar el proyecto.'],
    flujoPrincipal: [
      'El administrador crea el proyecto desde /admin/projects con POST /api/admin/projects (requiere slug y title), quedando en estado "activo" y no visible al público.',
      'Registra una interacción de seguimiento (llamada, reunión, tarea) con POST /api/admin/interactions, insertando en la tabla interactions con tipo, título, cuerpo y próxima acción.',
      'Marca la interacción como resuelta con PUT /api/admin/interactions (done, doneAt).',
      'Documenta una decisión de arquitectura con POST /api/admin/projects/[id]/adrs, insertando en project_adrs (contexto, decisión, justificación, estado).',
      'Opcionalmente marca el ADR como isPublic para exponerlo en la vitrina pública del proyecto.',
    ],
    flujosAlternos: [
      { titulo: 'Actualizar estado del proyecto', pasos: ['El administrador cambia el estado con PUT /api/admin/projects/[id] a pausado, completado o archivado.'] },
      { titulo: 'Editar o borrar un ADR', pasos: ['El administrador corrige o elimina una decisión previa vía PUT/DELETE sobre project_adrs.'] },
    ],
    excepciones: ['El POST de creación llega sin slug o title: la API responde 400 sin tocar la base de datos.'],
    postcondiciones: ['El proyecto queda con un historial trazable de interacciones y decisiones arquitectónicas en interactions y project_adrs.'],
  },
  {
    id: 'CU-08',
    precondiciones: ['El proyecto existe.', 'ENCRYPTION_KEY está configurada si el costo incluye credenciales cifradas.', 'Existen tasas de cambio en app_settings para costos que no están en USD.'],
    flujoPrincipal: [
      'El administrador registra un servicio o costo (ciclo de facturación, moneda, quién paga y a quién se factura) insertando en project_services.',
      'Registra el ingreso cobrado o pendiente en la tabla finances.',
      'La vista del proyecto invoca projectPnL() (src/lib/pnl.ts) con los servicios, las finanzas y las tasas de cambio.',
      'projectPnL calcula el costo mensual equivalente en USD por servicio y lo proyecta desde la fecha de inicio del proyecto.',
      'Se obtiene el margen estimado restando el costo acumulado a los ingresos cobrados.',
      'El panel muestra ingresos, costo mensual/anual, costo acumulado y margen, coloreado según sea positivo o negativo.',
    ],
    flujosAlternos: [
      { titulo: 'Editar o eliminar un servicio', pasos: ['El administrador ajusta o borra un costo; el P&L se recalcula en el siguiente render, sin job asíncrono.'] },
      { titulo: 'Costo sin tasa de cambio', pasos: ['Un costo en moneda sin tasa configurada se excluye del total y se muestra como advertencia con link a /admin/settings.'] },
    ],
    excepciones: ['Falta ENCRYPTION_KEY al guardar credenciales de un servicio: la API responde 500 pidiendo configurar la clave de cifrado.'],
    postcondiciones: ['El P&L del proyecto refleja el nuevo costo o ingreso desde el siguiente GET del detalle, sin desfase.'],
  },
  {
    id: 'CU-11',
    precondiciones: ['El administrador tiene sesión activa (o, en el modo automático, el cron externo dispone del CRON_SECRET).', 'Vercel Blob está habilitado en el proyecto.'],
    flujoPrincipal: [
      'El administrador dispara el backup manual desde /admin/backup.',
      'runBackup() consulta en paralelo las tablas de negocio (clients, projects, messages, finances, projectServices, projectAdrs, briefings, entre otras).',
      'Arma un dump JSON con metadatos de versión y fecha, más el contenido de cada tabla.',
      'Sube el dump a Vercel Blob como backups/portfolio-{fecha}-{timestamp}.json con acceso privado.',
      'Devuelve al panel la URL, el tamaño y el pathname del backup generado.',
      'El panel lista los últimos 30 backups ordenados por fecha para verificación visual.',
    ],
    flujosAlternos: [
      { titulo: 'Backup automático por cron', pasos: ['Vercel Cron llama al mismo endpoint con el CRON_SECRET en lugar de sesión de administrador, ejecutando runBackup() sin intervención manual.'] },
      { titulo: 'Consultar historial sin ejecutar', pasos: ['El administrador solo lista los backups existentes, sin generar uno nuevo.'] },
    ],
    excepciones: ['Falla la conexión a la base de datos durante el respaldo: el endpoint responde 500 y el fallo queda registrado en logs, sin generar un blob parcial.'],
    postcondiciones: ['Queda un archivo JSON inmutable en Vercel Blob con una fotografía completa de las tablas de negocio en ese momento.'],
  },
  {
    id: 'CU-13',
    precondiciones: ['El administrador tiene sesión activa.', 'La ruta objetivo no pertenece a /admin, /api/admin ni /api/auth (protegidas contra auto-sabotaje).'],
    flujoPrincipal: [
      'El administrador crea un flag de chaos desde /admin/lab/chaos, indicando tipo (latencia, error 500 o caída de servicio), ruta objetivo y TTL.',
      'El sistema valida el tipo y la ruta, aplica topes de seguridad (latencia máxima y TTL máximo) y calcula la expiración.',
      'El flag se inserta activo en la tabla chaos_flags y se invalida la caché para que aplique de inmediato.',
      'En cada request, el middleware evalúa los flags activos (con caché corta) y busca una coincidencia con la ruta solicitada.',
      'Si coincide, aplica el fallo simulado: introduce latencia, o responde error 500/503 con un header que identifica que es chaos.',
      'El chequeo de uptime del cron detecta la caída simulada en su siguiente sondeo, igual que detectaría una caída real.',
    ],
    flujosAlternos: [
      { titulo: 'Expiración natural', pasos: ['Al vencer el TTL, el flag deja de aplicarse automáticamente, sin que el administrador tenga que desactivarlo.'] },
      { titulo: 'Botón de pánico', pasos: ['El administrador desactiva todos los flags activos de una sola vez desde el panel.'] },
    ],
    excepciones: ['Si la lectura de flags falla por un problema de base de datos, el middleware falla abierto: el request pasa limpio y nunca se cae el sitio real por un error del propio motor de caos.'],
    postcondiciones: ['Las rutas coincidentes sufren el fallo simulado hasta que el flag expira o se apaga manualmente, permitiendo validar que el monitoreo lo detecta.'],
  },
  {
    id: 'CU-16',
    precondiciones: ['Existe un deck en la biblioteca: un archivo HTML autónomo con un <deck-stage> del que se extrajeron sus slides al subirlo.'],
    flujoPrincipal: [
      'El administrador pulsa Presentar y confirma en una pantalla que muestra el deck, su número de slides y la caducidad de la sesión.',
      'El sistema crea la sesión en Redis en estado lobby, con slide 0 y un PIN de cuatro caracteres (dos letras y dos dígitos) comprobado contra las rutas reservadas del sitio y contra los PIN ya en uso.',
      'La pantalla de reparto ofrece las dos vistas: la pantalla principal para el proyector y el control remoto, este último también como QR para escanearlo con el celular.',
      'La pantalla principal muestra a pantalla completa el QR hacia codebymike.tech/{pin} y el PIN escrito en grande; es la única vista que los muestra.',
      'El público escanea o teclea la dirección y ve la pantalla de espera con el título del deck.',
      'El administrador inicia desde el control remoto, que exige sesión de administrador y valida además el secreto de la sesión.',
      'Cada comando (anterior, siguiente, salto directo) se valida en el servidor contra el rango de slides, se persiste en Redis y se publica al bus.',
      'Cada dispositivo del salón, suscrito directamente al bus, recibe el cambio y salta al slide correspondiente en menos de 300 ms.',
    ],
    flujosAlternos: [
      { titulo: 'Espectador que llega tarde', pasos: ['Al conectar, el cliente pide el snapshot de la sesión y entra directamente al slide en curso, sin ver los anteriores.'] },
      { titulo: 'Navegación directa', pasos: ['El administrador abre el selector de slides del control remoto y salta a uno concreto por su número y rótulo, en lugar de avanzar de a uno.'] },
      { titulo: 'Cierre con feedback', pasos: ['Al pasar del último slide o pulsar Finalizar, las tres vistas muestran la misma pantalla de cierre con un QR hacia /feedback.'] },
    ],
    excepciones: [
      'Si se pierde la red del celular, al reconectar el control retoma el slide real: el servidor es la fuente de verdad y el cliente nunca impone su estado.',
      'Si un mensaje del bus se pierde (pub/sub no garantiza entrega), la resincronización periódica del snapshot corrige la pantalla en menos de diez segundos.',
      'Si el bus no llega a conectar, cada cliente cae a consultar el snapshot en bucle corto: se degrada la latencia, no la sincronía.',
      'Si el PIN no existe o la sesión terminó, la vista del público muestra la pantalla de cierre con el enlace de feedback, nunca un error crudo.',
      'Un texto de un segmento que no tenga forma de PIN devuelve el 404 normal del sitio sin llegar a consultar Redis.',
    ],
    postcondiciones: ['Al terminar, la sesión pasa a estado ended y libera su PIN, que vuelve a quedar disponible para otra sesión. El estado efímero caduca solo por TTL sin dejar rastro en la base de datos.'],
  },
]

// ── Prueba de validación de usabilidad ──────────────────────────────────────
export interface PasoUsabilidad {
  paso: string
  queHacer: string
  ejemploAplicado: string
  evidencia?: string
}

export const PRUEBA_USABILIDAD_META = {
  flujo: 'Descargar el CV desde /contact (HU-31)',
  origen: 'src/pages/cv/descargar.astro, src/pages/api/cv/{capture,download}.ts',
}

export const PRUEBA_USABILIDAD: PasoUsabilidad[] = [
  {
    paso: '1. Definir necesidad',
    queHacer: 'Expresar el problema real desde el usuario.',
    ejemploAplicado: 'Un visitante quiere llevarse el CV del desarrollador sin pedirlo por correo o WhatsApp y sin crear cuenta.',
  },
  {
    paso: '2. Crear escenario',
    queHacer: 'Describir una tarea real de principio a fin.',
    ejemploAplicado: 'Llegar a /contact, encontrar el botón "Descargar CV", hacer clic, esperar la pantalla de "Preparando tu descarga…" y terminar con el PDF guardado en su dispositivo.',
  },
  {
    paso: '3. Elegir participantes',
    queHacer: 'Seleccionar perfiles representativos.',
    ejemploAplicado: 'Un reclutador con prisa (revisa muchos perfiles por día), alguien con bloqueador de anuncios/JS restringido, y alguien en un celular con conexión lenta.',
  },
  {
    paso: '4. Establecer criterios',
    queHacer: 'Definir éxito observable y medible.',
    ejemploAplicado: 'Completa la descarga en menos de 10 segundos, sin dudar frente al botón, sin quedarse esperando indefinidamente en el spinner, y sin necesitar ayuda.',
  },
  {
    paso: '5. Observar',
    queHacer: 'Evitar enseñar el flujo; registrar dudas, errores y abandonos.',
    ejemploAplicado: 'El reclutador duda un instante si "Descargar CV" abre el archivo o lo descarga; el participante con JS bloqueado ve el spinner girar sin avanzar y no encuentra el enlace alternativo.',
  },
  {
    paso: '6. Analizar y decidir',
    queHacer: 'Relacionar hallazgos con la necesidad y el riesgo.',
    ejemploAplicado: 'El flujo funciona técnicamente (fail-open, incluso sin JS vía el enlace de <noscript>), pero la pantalla intermedia de "Preparando tu descarga…" genera duda porque no explica qué está pasando ni cuánto va a tardar. El enlace de <noscript> queda visualmente escondido detrás del spinner en vez de leerse como una acción alternativa.',
  },
]
