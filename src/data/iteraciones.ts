// ─────────────────────────────────────────────────────────────────────────────
// Iteraciones — DobleYo Café
// Tablero XP derivado del historial REAL de GitHub (mikerb95/dobleyo) y del
// CHANGELOG del proyecto. Cada iteración se ancla a su momento histórico en
// GitHub (rango de fechas + enlace a los commits de ese periodo) y cada historia
// de usuario lleva su DoD (Definition of Done) inferido de lo realmente
// desarrollado y documentado en el CHANGELOG y en las Fases 0–12 del plan.
//
// El "par" refleja la programación en pareja humano–IA: Mike Restrepo conduce
// las decisiones de diseño y un agente de IA (Claude / Claude Opus / GitHub
// Copilot) actúa como navegador (ver bibliografía en /admin/iteraciones).
// ─────────────────────────────────────────────────────────────────────────────

export const REPO = "https://github.com/mikerb95/dobleyo";

/** Enlace a los commits de un rango de fechas en la rama principal. */
export function commitsUrl(since: string, until: string): string {
  return `${REPO}/commits/main/?since=${since}&until=${until}`;
}

export interface Par {
  nombre: string;
  rol: string;
  color: string;
}

export const PARES: Record<string, Par> = {
  MR: { nombre: "Mike Rodríguez", rol: "Conductor (humano)", color: "#3a2618" },
  IA: { nombre: "Claude", rol: "Navegador (IA)", color: "#2a6f97" },
  OP: { nombre: "Claude Opus", rol: "Navegador (IA)", color: "#5319e7" },
  CP: { nombre: "GitHub Copilot", rol: "Navegador (IA)", color: "#1f6feb" },
};

export interface Columna {
  id: string;
  nombre: string;
  color: string;
}

// 5 columnas XP. En un tablero retrospectivo la mayoría de historias terminan
// en "Aceptada"; las que siguen abiertas según el CHANGELOG quedan en sus
// columnas previas.
export const COLUMNAS: Columna[] = [
  { id: "cola", nombre: "Cola (pendiente)", color: "#9aa0a6" },
  { id: "iteracion", nombre: "Planeada", color: "#5319e7" },
  { id: "desarrollo", nombre: "En desarrollo", color: "#2a6f97" },
  { id: "aceptacion", nombre: "En aceptación", color: "#c9893d" },
  { id: "aceptada", nombre: "Aceptada", color: "#2e7d5b" },
];

export type EstadoDoD = "pass" | "fail" | "pend";

export interface CriterioDoD {
  texto: string;
  estado: EstadoDoD;
}

export interface Historia {
  id: string;
  titulo: string;
  tipo: "historia" | "bug" | "tarea" | "spike";
  valor: "alto" | "medio" | "bajo";
  col: string;
  par: keyof typeof PARES;
  agente?: string;
  fecha?: string;
  tags: string[];
  dod: CriterioDoD[];
}

export interface Iteracion {
  id: string;
  fase: string;
  nombre: string;
  rango: string;
  ghSince: string;
  ghUntil: string;
  /** Nº aproximado de commits del periodo (del historial real). Opcional. */
  commits?: number;
  resumen: string;
  historias: Historia[];
}

// Helpers de DoD para reducir ruido al escribir.
const ok = (texto: string): CriterioDoD => ({ texto, estado: "pass" });
const pend = (texto: string): CriterioDoD => ({ texto, estado: "pend" });

export const ITERACIONES: Iteracion[] = [
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "jun-erp",
    fase: "Post-plan · Evolución",
    nombre: "Rediseño del ERP, checkout e internacionalización",
    rango: "15 – 20 jun 2026",
    ghSince: "2026-06-15",
    ghUntil: "2026-06-21",
    commits: 401,
    resumen:
      "Sprint mayor de pulido: rediseño de todo el módulo admin al sistema de diseño compartido, checkout con sesión, navegación localizada ES/EN y endpoints faltantes del backend.",
    historias: [
      {
        id: "DY-ERP-01",
        titulo:
          "Como administrador, quiero que todas las páginas del ERP compartan el mismo sistema de diseño para operar sin inconsistencias visuales",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-20", tags: ["admin", "ui", "fase-10"],
        dod: [
          ok("Productos, Lotes, Inventario, Usuarios, Cosecha, Tostión, Empaque y Etiquetas usan page-header, kpi-tile, card, erp-table, badge y modal."),
          ok("Se eliminaron los colores hex hardcodeados y los emojis de título; todo el contenido va dentro de .erp-body."),
          ok("Los alert() se reemplazaron por toasts y los booleanos 0/1 de SQLite se normalizan (corrige filtros)."),
        ],
      },
      {
        id: "DY-ERP-02",
        titulo:
          "Como administrador, quiero un dashboard con resumen ejecutivo e indicadores con tendencia para tomar decisiones de un vistazo",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-20", tags: ["dashboard", "kpi", "fase-10"],
        dod: [
          ok("Los KPIs (ventas, pedidos, ticket, stock bajo) consultan las columnas reales del schema y muestran deltas vs. periodo anterior."),
          ok("El endpoint /api/dashboard/summary entrega top productos, top ciudades, estado de pedidos y snapshots de producción e inventario por rango (30d/90d/12m)."),
          ok("La gráfica de área SVG y el selector de rango funcionan sin recargar la página."),
        ],
      },
      {
        id: "DY-ERP-03",
        titulo:
          "Como cliente con sesión, quiero que el checkout precargue mis datos y, como invitado, poder comprar igualmente",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-19", tags: ["checkout", "auth", "fase-4"],
        dod: [
          ok("POST /api/orders pasa por optionalAuth: con sesión la orden se asocia al user_id; como invitado sigue funcionando."),
          ok("Con sesión, el checkout precarga nombre, email, dirección y teléfono desde /api/auth/me."),
          ok("La auditoría se atribuye al usuario autenticado en lugar de null."),
        ],
      },
      {
        id: "DY-ERP-04",
        titulo:
          "Como visitante, quiero navegar el sitio en español o inglés con textos y enlaces coherentes según el idioma",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-20", tags: ["i18n", "fase-9"],
        dod: [
          ok("Header y Footer resuelven navegación, etiquetas y disclaimer según el idioma activo."),
          ok("La vista previa del carrito formatea moneda y pluraliza ítems según el idioma."),
          ok("Se publicó la página de venta mayorista (wholesale) con contenido dinámico."),
        ],
      },
      {
        id: "DY-ERP-05",
        titulo:
          "Bug: módulos de Inventario y línea de Producción mostraban error por endpoints inexistentes",
        tipo: "bug", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-20", tags: ["inventario", "produccion", "api"],
        dod: [
          ok("Se implementaron /api/inventory/summary, /items, /items/:id y /feed con el envoltorio { success, data }."),
          ok("Se creó el sub-router /api/production/lots que reconstruye la trazabilidad por etapa encadenando las tablas operativas."),
          ok("Se verificó contra la base Turso real: 200 con datos, 404 para id inexistente. Paridad server/api intacta."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "jun-crm",
    fase: "Post-plan · Datos y contenido",
    nombre: "CRM, MercadoLibre, blog y catación SCA",
    rango: "16 – 18 jun 2026",
    ghSince: "2026-06-16",
    ghUntil: "2026-06-19",
    resumen:
      "Conexión de datos reales en CRM y MercadoLibre (captura, sync automático y webhook), gestor de blog con página pública, y rediseño profesional de la catación SCA y otros workbenches de producción.",
    historias: [
      {
        id: "DY-CRM-01",
        titulo:
          "Como administrador, quiero gestionar cuentas en el CRM y vincular ventas de MercadoLibre para conocer el valor de cada cliente",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-18", tags: ["crm", "mercadolibre"],
        dod: [
          ok("Se corrigió la vista crm_account_overview (columnas reales) y la migración CRM quedó registrada en el runner."),
          ok("Se pueden vincular/desvincular ventas a una cuenta y el LTV se recalcula al instante."),
          ok("La vinculación es manual y documentada (sales_tracking no guarda identidad del comprador)."),
        ],
      },
      {
        id: "DY-CRM-02",
        titulo:
          "Como sistema, quiero capturar y sincronizar las órdenes de MercadoLibre automáticamente para no perder ventas ni reprocesar todo",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-18", tags: ["mercadolibre", "cron", "webhook"],
        dod: [
          ok("Migración idempotente agrega comprador, estado de pago y de envío a sales_tracking; el servicio los persiste."),
          ok("syncOrders es incremental (since con solapamiento de 1 día) e idempotente por ml_order_id; cron cada 6 h."),
          ok("POST /webhook responde 200 de inmediato, valida el seller y sincroniza la orden referenciada."),
        ],
      },
      {
        id: "DY-CRM-03",
        titulo:
          "Como editor, quiero crear y publicar entradas de blog desde el admin y, como visitante, leerlas en el sitio",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-18", tags: ["blog", "contenido"],
        dod: [
          ok("Nuevo gestor /admin/blog (crear/editar/eliminar, borradores) que consume /api/blog/admin/all."),
          ok("Página pública /blog/[slug] (SSR) renderiza Markdown con SEO completo (JSON-LD BlogPosting)."),
          ok("Los borradores no aparecen en la portada pública."),
        ],
      },
      {
        id: "DY-CRM-04",
        titulo:
          "Como catador, quiero registrar la catación SCA con un scoresheet en vivo para evaluar la calidad del lote",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-18", tags: ["cupping", "calidad", "produccion"],
        dod: [
          ok("Scoresheet sticky con medidor circular SVG, radar sensorial de 6 ejes y desglose de los 9 atributos."),
          ok("El puntaje cliente replica la fórmula del backend (Σ 9 atributos − defectos×4, máx. 90)."),
          ok("Bug corregido: el total se calcula al iniciar en lugar de quedar en un placeholder hardcodeado."),
        ],
      },
      {
        id: "DY-CRM-05",
        titulo:
          "Como visitante, quiero ver una confirmación visual al agregar un producto al carrito",
        tipo: "historia", valor: "bajo", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-16", tags: ["carrito", "ux"],
        dod: [
          ok("Un drawer lateral global se abre al disparar el evento cart:added con el detalle del carrito."),
          ok("Es accesible (role=dialog, cierre con Esc/overlay, bloqueo de scroll) y respeta prefers-reduced-motion."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "jun-seg",
    fase: "Post-plan · Seguridad y analítica",
    nombre: "Blindaje de seguridad y analítica de demanda (Python)",
    rango: "9 – 14 jun 2026",
    ghSince: "2026-06-09",
    ghUntil: "2026-06-15",
    commits: 79,
    resumen:
      "Endurecimiento de seguridad (CSP/HSTS, tokens, rate limiting, webhook de pagos), primer módulo en Python para pronóstico de demanda y avance de la app móvil con cola offline.",
    historias: [
      {
        id: "DY-SEG-01",
        titulo:
          "Como responsable del sistema, quiero blindar la plataforma (CSP/HSTS, rate limiting, tokens) para reducir la superficie de ataque",
        tipo: "tarea", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-11", tags: ["seguridad", "fase-11"],
        dod: [
          ok("Cabeceras de seguridad (CSP/HSTS) y CORS endurecidos en páginas y API."),
          ok("Rate limiting y verificación del webhook de pagos implementados."),
          ok("Tokens de verificación y manejo de contraseñas reforzados; se cerró una fuga de configuración."),
        ],
      },
      {
        id: "DY-SEG-02",
        titulo:
          "Como administrador, quiero un pronóstico de demanda por SKU para planear producción e inventario",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-14", tags: ["python", "analitica", "demanda"],
        dod: [
          ok("Módulo Python aislado: calcula y escribe una tabla; Node/Astro solo lee (separación limpia)."),
          ok("CRUD de demanda 100% Python con exportación a Excel (openpyxl)."),
          pend("La fiabilidad mejorará cuando exista la tabla orders como fuente de ventas web directas (Fase 4)."),
        ],
      },
      {
        id: "DY-SEG-03",
        titulo:
          "Como caficultor en campo, quiero que la app móvil registre datos sin conexión y los sincronice luego sin duplicar",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-06-10", tags: ["movil", "offline"],
        dod: [
          ok("Cola offline con idempotencia y primera pantalla funcional."),
          ok("Flujo de tokens nativo y paridad de endpoints con el backend web."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "may-movil",
    fase: "Post-plan · App móvil",
    nombre: "App móvil (Expo) y auditoría de mantenibilidad",
    rango: "Mayo 2026",
    ghSince: "2026-05-01",
    ghUntil: "2026-06-01",
    commits: 157,
    resumen:
      "Arranque del proyecto de app móvil en Expo/TypeScript con paquete compartido, y auditoría de mantenibilidad del backend (observabilidad, paginación, capa de servicios, seguridad).",
    historias: [
      {
        id: "DY-MOV-01",
        titulo:
          "Como caficultor, quiero una app móvil nativa para operar la producción desde el campo",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-05-30", tags: ["movil", "expo"],
        dod: [
          ok("App inicializada con Expo + TypeScript; RootLayout y query client con persistencia para soporte offline."),
          ok("AuthContext con manejo de sesión y token seguro vía Expo SecureStore."),
          ok("Paquete compartido (shared) con cliente de API y endpoints reutilizables."),
        ],
      },
      {
        id: "DY-MOV-02",
        titulo:
          "Como mantenedor, quiero observabilidad, paginación y una capa de servicios para que el backend escale con orden",
        tipo: "tarea", valor: "alto", col: "aceptada", par: "OP", agente: "Claude Opus",
        fecha: "2026-05-20", tags: ["mantenibilidad", "backend"],
        dod: [
          ok("Auditoría de mantenibilidad aplicada: observabilidad, paginación y extracción a service layer."),
          ok("Revisión de seguridad y coherencia del backend documentada."),
          ok("Limpieza de HTML legacy y estrategia CSS unificada (Tarea 4.3)."),
        ],
      },
      {
        id: "DY-MOV-03",
        titulo:
          "Como interesado, quiero una página showcase que resuma el proyecto y su arquitectura",
        tipo: "tarea", valor: "bajo", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-05-21", tags: ["showcase", "docs"],
        dod: [
          ok("Página showcase publicada con overview y detalles de arquitectura."),
          ok("Se removió el atributo noindex para permitir su indexación."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "abr-turso-ml",
    fase: "Post-plan · Plataforma de datos",
    nombre: "Migración a Turso, MercadoLibre y rediseño del admin",
    rango: "Abril 2026",
    ghSince: "2026-04-01",
    ghUntil: "2026-05-01",
    commits: 270,
    resumen:
      "Consolidación de la base de datos en Turso (libSQL/SQLite) como única fuente, primer panel de MercadoLibre y rediseño de las tablas y vistas del panel de administración.",
    historias: [
      {
        id: "DY-TUR-01",
        titulo:
          "Como sistema, necesito una única base de datos (Turso/libSQL) para simplificar la operación Colombia + USA",
        tipo: "tarea", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-04-25", tags: ["bd", "turso"],
        dod: [
          ok("server/db.js reescrito de pg a @libsql/client conservando query()/getClient()/withTransaction() y añadiendo lastInsertRowid."),
          ok("schema.sql convertido a SQLite (AUTOINCREMENT, TEXT, TIMESTAMP) y queries adaptadas (?, datetime('now'), sin type casts)."),
          ok("Variables TURSO_DATABASE_URL y TURSO_AUTH_TOKEN documentadas; soporte file:local.db en desarrollo."),
        ],
      },
      {
        id: "DY-TUR-02",
        titulo:
          "Como administrador, quiero ver y sincronizar las órdenes de MercadoLibre desde un panel dedicado",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-04-30", tags: ["mercadolibre", "ventas"],
        dod: [
          ok("Nueva página /admin/mercadolibre con sincronización y gestión de órdenes."),
          ok("Ítem de navegación de MercadoLibre añadido al AdminLayout."),
        ],
      },
      {
        id: "DY-TUR-03",
        titulo:
          "Como administrador, quiero tablas del panel legibles y consistentes para trabajar cómodo con inventario, ventas y usuarios",
        tipo: "tarea", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-04-30", tags: ["admin", "ui"],
        dod: [
          ok("Estilos de tablas de admin, transacciones e inventario mejorados para legibilidad."),
          ok("Página de estadísticas de producción y mapa de ventas rediseñados."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  // PLAN DE 13 FASES (marzo 2026) — documentado en CHANGELOG
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "plan-d",
    fase: "Plan · Fases 9–12",
    nombre: "Plataforma y calidad: i18n, admin pro, SEO/seguridad y CI/CD",
    rango: "2 – 4 mar 2026",
    ghSince: "2026-03-02",
    ghUntil: "2026-03-05",
    resumen:
      "Cierre del plan inicial: versión en inglés para el mercado USA, panel de administración profesional, SEO + auditoría de seguridad y el pipeline de CI/CD con pruebas.",
    historias: [
      {
        id: "F9-1",
        titulo:
          "Fase 9 — Como visitante internacional, quiero el sitio en inglés con precios en USD y SEO multilingüe",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-04", tags: ["fase-9", "i18n", "seo"],
        dod: [
          ok("Helpers i18n (t, getLang, formatPrice, formatDate) y JSON es/en completos."),
          ok("Páginas /en/shop, /en/contact y /en/traceability con precios USD y opciones B2B."),
          ok("BUG-004 resuelto: <html lang> dinámico; canonical y hreflang ES/EN en todas las públicas."),
        ],
      },
      {
        id: "F10-1",
        titulo:
          "Fase 10 — Como administrador, quiero un panel profesional con dashboard y gestión de pedidos",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-02", tags: ["fase-10", "admin"],
        dod: [
          ok("AdminLayout rediseñado con sidebar por secciones, topbar móvil y estado activo por URL."),
          ok("/admin (dashboard con KPIs) y /admin/pedidos (lista paginada + cambio de estado) creados."),
          ok("DEBT-006 resuelto: el admin.html legacy redirige al nuevo panel."),
        ],
      },
      {
        id: "F11-1",
        titulo:
          "Fase 11 — Como responsable, quiero SEO técnico y cabeceras de seguridad activas en producción",
        tipo: "tarea", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-02", tags: ["fase-11", "seo", "seguridad"],
        dod: [
          ok("robots.txt y sitemap.xml dinámico (14 URLs); JSON-LD Organization y Product/ItemList."),
          ok("BUG-011 resuelto: CSP activo en server/index.js y api/index.js (paridad)."),
          pend("3 vulnerabilidades high en path-to-regexp (transitivas) quedan pendientes hasta parche de Astro."),
        ],
      },
      {
        id: "F12-1",
        titulo:
          "Fase 12 — Como equipo, quiero un pipeline de CI/CD con pruebas automáticas para desplegar con confianza",
        tipo: "tarea", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-03", tags: ["fase-12", "ci-cd", "testing"],
        dod: [
          ok("Vitest + ESLint + Playwright configurados; 27 pruebas (audit, auth, orders + smoke E2E) en verde."),
          ok("GitHub Actions: lint → typecheck → unit tests → coverage → build en cada push/PR."),
          ok("DEBT-007 resuelto: suite de pruebas automatizadas implementada."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "plan-c",
    fase: "Plan · Fases 6–8",
    nombre: "Operación y datos: finanzas, fincas y mapa de calor",
    rango: "2 – 3 mar 2026",
    ghSince: "2026-03-02",
    ghUntil: "2026-03-04",
    resumen:
      "Módulo financiero de doble partida, landing pages públicas de fincas/caficultores y mapa de calor de ventas que combina tienda web y MercadoLibre.",
    historias: [
      {
        id: "F6-1",
        titulo:
          "Fase 6 — Como administrador, quiero registrar gastos, facturas y pagos sobre una base contable de doble partida",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-02", tags: ["fase-6", "finanzas"],
        dod: [
          ok("Migración con 15 tablas financieras y router /api/finance con 14 endpoints (transacciones con getClient)."),
          ok("/admin/finanzas con 4 KPIs del mes y pestañas (facturas compra/venta, gastos, pagos)."),
          ok("DEBT-005 resuelto: el esquema contable pasa a tener rutas/servicios/páginas."),
        ],
      },
      {
        id: "F6-2",
        titulo:
          "Fase 6 — Como caficultor, quiero ver mis liquidaciones históricas con detalle por lote",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-02", tags: ["fase-6", "caficultor"],
        dod: [
          ok("/app/finanzas consume /api/finance/my-invoices (sin datos hardcodeados) con totales y estado."),
        ],
      },
      {
        id: "F7-1",
        titulo:
          "Fase 7 — Como visitante, quiero conocer las fincas y, como caficultor, gestionar el perfil de la mía",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-02", tags: ["fase-7", "fincas"],
        dod: [
          ok("Tabla farms + router con 8 endpoints; slug auto-generado con fallback de colisión."),
          ok("/fincas (catálogo filtrable) y /finca/[slug] (landing SEO) públicas; /app/mi-finca para el caficultor."),
          ok("Las fincas requieren publicación manual del admin (is_published=false por defecto)."),
        ],
      },
      {
        id: "F8-1",
        titulo:
          "Fase 8 — Como administrador, quiero un mapa de calor de ventas que combine tienda web y MercadoLibre",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-03", tags: ["fase-8", "heatmap", "ventas"],
        dod: [
          ok("Geocodificación con Nominatim (no bloqueante) y router /api/heatmap (web + ML con filtros)."),
          ok("Filtros por periodo/canal/producto, top-10 ciudades y exportación CSV sin recargar."),
          ok("Corregido el bug de moneda ARS → COP y la fuente de datos ML-only."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "plan-b",
    fase: "Plan · Fases 3–5",
    nombre: "Comercio y trazabilidad: legal, pagos y QR",
    rango: "2 – 3 mar 2026",
    ghSince: "2026-03-02",
    ghUntil: "2026-03-04",
    resumen:
      "Cumplimiento legal colombiano, flujo de compra completo con pasarela Wompi y trazabilidad pública del café por QR a lo largo de todo el pipeline.",
    historias: [
      {
        id: "F3-1",
        titulo:
          "Fase 3 — Como usuario, quiero páginas legales y consentimiento de cookies conforme a la ley colombiana",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-02", tags: ["fase-3", "legal", "compliance"],
        dod: [
          ok("Privacidad (Ley 1581/2012), Términos (Ley 1480/2011) y Accesibilidad (Ley 1618/2013) publicadas."),
          ok("CookieBanner con consentimiento persistido y checkbox obligatorio de tratamiento de datos en registro."),
          ok("BUG-010 resuelto: los enlaces legales del footer dejan de apuntar a #."),
        ],
      },
      {
        id: "F4-1",
        titulo:
          "Fase 4 — Como cliente, quiero completar mi compra con pago en línea (Wompi) y recibir confirmación",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-02", tags: ["fase-4", "pagos", "checkout"],
        dod: [
          ok("Tablas customer_orders/customer_order_items y router de órdenes (crear, estado público, admin, webhook HMAC)."),
          ok("Checkout con cálculo de envío (gratis ≥ $120.000 COP) y página /confirmacion con polling de estado."),
          ok("BUG-006/007/008 resueltos: checkout funcional, órdenes en BD y email de contacto por Resend."),
        ],
      },
      {
        id: "F4-2",
        titulo:
          "Fase 4 — Como negocio, quiero ofrecer MercadoPago además de Wompi como pasarela alternativa",
        tipo: "historia", valor: "bajo", col: "cola", par: "MR", agente: "Claude",
        fecha: "2026-03-02", tags: ["fase-4", "pagos"],
        dod: [
          pend("Los stubs /api/mp/* se mantienen como placeholders (responden 501) a la espera de integración."),
        ],
      },
      {
        id: "F5-1",
        titulo:
          "Fase 5 — Como cliente, quiero escanear el QR del empaque y ver el historial completo de mi café",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-03", tags: ["fase-5", "trazabilidad", "qr"],
        dod: [
          ok("Endpoint público /api/traceability/:code con JOIN del pipeline: cosecha → verde → tueste → tostado → empaque."),
          ok("Página /t/[code] (SSR) con timeline de 4 etapas, puntaje SCA y notas; el scanner decodifica URLs /t/{code}."),
          ok("DEBT-004 resuelto: la trazabilidad usa datos reales en lugar de hardcodeados."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "plan-a",
    fase: "Plan · Fases 0–2",
    nombre: "Fundamentos y migración: gobernanza IA, PostgreSQL y mobile-first",
    rango: "1 mar 2026",
    ghSince: "2026-03-01",
    ghUntil: "2026-03-02",
    resumen:
      "Base documental y de gobernanza para el trabajo con IA, estabilización del backend sobre PostgreSQL y unificación del diseño mobile-first.",
    historias: [
      {
        id: "F0-1",
        titulo:
          "Fase 0 — Como equipo, quiero una base documental y de gobernanza IA para que cualquiera contribuya con contexto",
        tipo: "tarea", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-01", tags: ["fase-0", "docs", "gobernanza"],
        dod: [
          ok("AGENTS.md y CLAUDE.md con convenciones, stack, patrones y reglas; tabla de 17 ítems de deuda."),
          ok("36 historias de usuario, 79 requisitos funcionales y 42 no funcionales documentados."),
          ok("Análisis de requerimientos y arquitectura técnica con diagramas y decisiones."),
        ],
      },
      {
        id: "F1-1",
        titulo:
          "Fase 1 — Como sistema, necesito un backend estable sobre PostgreSQL con paridad standalone/serverless",
        tipo: "tarea", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-01", tags: ["fase-1", "bd", "postgresql"],
        dod: [
          ok("Driver migrado de mysql2 a pg; placeholders ? → $n y funciones MySQL → PostgreSQL."),
          ok("BUG-001 resuelto: orders.js usaba router. no declarado (crash en runtime)."),
          ok("BUG-002 resuelto: api/index.js monta los routers que faltaban (paridad con el standalone)."),
        ],
      },
      {
        id: "F1-2",
        titulo:
          "Fase 1 — Como usuario, quiero que el newsletter y la autenticación funcionen de forma consistente",
        tipo: "bug", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-01", tags: ["fase-1", "auth"],
        dod: [
          ok("BUG-009 resuelto: el newsletter del footer envía a /api/emails/newsletter con validación."),
          ok("BUG-012 resuelto: autenticación unificada a cookies HttpOnly (sin token en localStorage)."),
        ],
      },
      {
        id: "F2-1",
        titulo:
          "Fase 2 — Como usuario móvil, quiero navegar el sitio cómodamente en cualquier pantalla",
        tipo: "tarea", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-03-01", tags: ["fase-2", "mobile-first", "css"],
        dod: [
          ok("Breakpoints unificados al set canónico (480/768/1024/1400px)."),
          ok("El hero ya no desaparece en móvil; usa fondo de color con el video oculto."),
          ok("DEBT-002 y DEBT-003 resueltos: breakpoints inconsistentes y página /mobile con UA sniffing eliminada."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  // FUNDACIÓN (pre-plan) — agosto 2025 → febrero 2026
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "backend",
    fase: "Fundación · Backend",
    nombre: "Backend de producción y contabilidad",
    rango: "Ene – Feb 2026",
    ghSince: "2026-01-01",
    ghUntil: "2026-03-01",
    commits: 364,
    resumen:
      "Construcción del núcleo operativo del ERP: módulo de manufactura (lotes, tueste, control de calidad), módulo contable y la API del pipeline de café, con documentación y datos semilla.",
    historias: [
      {
        id: "DY-BE-01",
        titulo:
          "Como operación, quiero un módulo de manufactura para gestionar órdenes de producción, tueste y control de calidad",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-01-19", tags: ["produccion", "manufactura"],
        dod: [
          ok("Tablas de centros de trabajo, equipos de tueste, BOM, órdenes de producción y controles de calidad."),
          ok("Rutas de dashboard, órdenes y calidad de producción con datos semilla."),
          ok("Documentación del módulo y colección Postman para sus endpoints."),
        ],
      },
      {
        id: "DY-BE-02",
        titulo:
          "Como finanzas, quiero las tablas contables base (cuentas, asientos, facturas) para soportar la doble partida",
        tipo: "tarea", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-01-19", tags: ["contabilidad", "bd"],
        dod: [
          ok("Módulo contable con tablas de cuentas, diarios, asientos y facturas."),
          ok("Datos semilla de cuentas contables y catálogo inicial."),
        ],
      },
      {
        id: "DY-BE-03",
        titulo:
          "Como sistema, quiero la API del pipeline de café para registrar cada etapa del grano",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2026-01-24", tags: ["coffee", "api", "trazabilidad"],
        dod: [
          ok("Router de producción y endpoints del pipeline (cosecha → tueste → empaque)."),
          ok("Script de verificación de integridad de tablas y validez de datos."),
        ],
      },
    ],
  },
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "fundacion",
    fase: "Fundación · Tienda",
    nombre: "Tienda online: catálogo, carrito y checkout",
    rango: "Ago – Dic 2025",
    ghSince: "2025-08-29",
    ghUntil: "2026-01-01",
    commits: 134,
    resumen:
      "Primeros pasos del sitio: catálogo de productos, carrito con localStorage, checkout inicial, navegación y la primera API de stock. Base de marca y mobile.",
    historias: [
      {
        id: "DY-FN-01",
        titulo:
          "Como cliente, quiero explorar el catálogo de café y agregar productos al carrito",
        tipo: "historia", valor: "alto", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2025-09-22", tags: ["tienda", "carrito"],
        dod: [
          ok("Catálogo, página de contacto, FAQ y políticas con enrutamiento y metadata."),
          ok("Carrito y checkout con manejo de eventos y enlaces en todas las páginas."),
          ok("Filtros rápidos con scroller horizontal en móvil y banner promocional."),
        ],
      },
      {
        id: "DY-FN-02",
        titulo:
          "Como administrador, quiero una API de stock para gestionar existencias",
        tipo: "historia", valor: "medio", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2025-11-13", tags: ["stock", "api"],
        dod: [
          ok("API de gestión de stock con operaciones CRUD."),
          ok("Controles de cantidad (steppers) en los ítems del carrito."),
        ],
      },
      {
        id: "DY-FN-03",
        titulo:
          "Como visitante, quiero una marca y navegación coherentes en todo el sitio",
        tipo: "tarea", valor: "bajo", col: "aceptada", par: "MR", agente: "Claude",
        fecha: "2025-09-26", tags: ["marca", "nav", "ui"],
        dod: [
          ok("Logo en footer, estructura de navegación y mejoras de accesibilidad."),
          ok("Toggle de tema y ajustes de visibilidad en móvil."),
        ],
      },
    ],
  },
];

// Actividad real de commits por mes (historial completo del repo).
export const COMMITS_POR_MES: { mes: string; commits: number }[] = [
  { mes: "ago 25", commits: 9 },
  { mes: "sep 25", commits: 109 },
  { mes: "oct 25", commits: 2 },
  { mes: "nov 25", commits: 14 },
  { mes: "ene 26", commits: 352 },
  { mes: "feb 26", commits: 1 },
  { mes: "mar 26", commits: 130 },
  { mes: "abr 26", commits: 270 },
  { mes: "may 26", commits: 157 },
  { mes: "jun 26", commits: 474 },
];
