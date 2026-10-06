// Menú del panel: lo pintan el sidebar y lo recorre el buscador del dashboard
// (lib/asistente/buscar.ts). Una sola lista para que una página nueva aparezca
// en los dos sitios sin acordarse de nada más. `claves` son las palabras con
// las que Mike la buscaría y que no salen en la etiqueta ("¿quién me debe?"
// tiene que llevar a Clientes).
//
// Módulo puro: lo importan el servidor y el navegador.

export type EnlacePanel = { href: string; icon: string; label: string; claves?: string }

export type GrupoPanel = { title: string; links: EnlacePanel[] }

export const GRUPOS_PANEL: GrupoPanel[] = [
  {
    title: "Workspace",
    links: [
      {
        href: "/admin",
        claves: "inicio portada resumen hoy",
        icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
        label: "Dashboard",
      },
      {
        href: "/admin/repos",
        claves: "github código commits",
        icon: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4 M9 18c-4.51 2-5-2-7-2",
        label: "Repositorios",
      },
      {
        href: "/admin/monitors",
        claves: "uptime caídas páginas vigiladas disponibilidad certificados",
        icon: "M22 12h-4l-3 9L9 3l-3 9H2",
        label: "Monitoreo",
      },
      {
        href: "/admin/semana",
        claves: "semana reporte resumen semanal",
        icon: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
        label: "Resumen semanal",
      },
    ],
  },
  {
    title: "CRM",
    links: [
      {
        href: "/admin/projects",
        claves: "trabajos hitos",
        icon: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z M8 7v10 M12 7v10",
        label: "Proyectos",
      },
      {
        href: "/admin/clients",
        claves: "crm deudores quién me debe",
        icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M9 7m-4 0a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
        label: "Clientes",
      },
      {
        href: "/admin/seguimiento",
        claves: "pendientes tareas llamadas recordatorios",
        icon: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z",
        label: "Seguimiento",
      },
      {
        href: "/admin/messages",
        claves: "contacto bandeja correos formulario",
        icon: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
        label: "Mensajes",
      },
      {
        href: "/admin/asesor",
        claves: "chat burbuja whatsapp visitantes",
        icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z M8 9h8 M8 13h5",
        label: "Asesor en vivo",
      },
      {
        href: "/admin/plano",
        claves: "cotizaciones cotizar propuestas precios",
        icon: "M3 3h18v18H3z M3 9h8v12 M11 13h10 M15 3v10",
        label: "Plano · propuestas",
      },
      {
        href: "/admin/briefings",
        claves: "requerimientos alcance cotizaciones",
        icon: "M9 12h6 M9 16h6 M17 3H7a2 2 0 0 0-2 2v16l3-3 2 2 2-2 2 2 2-2 3 3V5a2 2 0 0 0-2-2z",
        label: "Briefings",
      },
      {
        href: "/admin/portal",
        claves: "clientes facturas acceso portal",
        icon: "M3 9h18 M9 21V9 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
        label: "Portal clientes",
      },
      {
        href: "/admin/presentaciones",
        claves: "diapositivas mazos slides",
        icon: "M2 3h20v14H2z M8 21h8 M12 17v4",
        label: "Presentaciones",
      },
      {
        href: "/admin/sustentacion",
        claves: "sena defensa",
        icon: "M12 2v6 M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z M9 13h6",
        label: "Sustentación",
      },
      {
        href: "/admin/capacitacion",
        claves: "cursos ia talleres",
        icon: "M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5 M12 12v6",
        label: "Capacitación IA",
      },
    ],
  },
  {
    title: "Finanzas",
    links: [
      {
        href: "/admin/resumen",
        claves: "mes ingresos gastos balance",
        icon: "M3 3v18h18 M7 16v-3 M11 16V9 M15 16v-5 M19 16V6",
        label: "Resumen mensual",
      },
      {
        href: "/admin/finances",
        claves: "cobrado pendiente proyectado plata dinero pagos",
        icon: "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
        label: "Ingresos",
      },
      {
        href: "/admin/costs",
        claves: "gastos suscripciones servicios renovaciones bóveda",
        icon: "M19 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z M3 10h18",
        label: "Costos",
      },
      {
        href: "/admin/vida",
        claves: "personal arriendo gastos",
        icon: "M3 10.5 12 3l9 7.5 M5 9v11h14V9 M12 17s-3-1.8-3-3.6A1.6 1.6 0 0 1 12 12.6a1.6 1.6 0 0 1 3 .8c0 1.8-3 3.6-3 3.6z",
        label: "Costos de vida",
      },
      {
        href: "/admin/infra",
        claves: "servidores hosting",
        icon: "M2 20h20 M5 20V9 M12 20V4 M19 20v-7 M5 9l7-5 7 9",
        label: "Infra básica",
      },
      {
        href: "/admin/computo",
        claves: "vercel cuota funciones",
        icon: "M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M9 9h6v6H9z M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M2 15h3 M19 9h3 M19 15h3",
        label: "Cómputo",
      },
      {
        href: "/admin/cuentas-cobro",
        claves: "facturar cobrar cobro factura retenciones",
        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4",
        label: "Cuentas de cobro",
      },
      {
        href: "/admin/domains",
        claves: "dominios vencen vencimiento dns renovar",
        icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20",
        label: "Dominios",
      },
    ],
  },
  {
    title: "Perfil",
    links: [
      {
        href: "/admin/certifications",
        claves: "certificados diplomas",
        icon: "M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12",
        label: "Certificaciones",
      },
      {
        href: "/admin/education",
        claves: "formación estudios",
        icon: "M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5",
        label: "Evolution Path",
      },
      {
        href: "/admin/aprendizaje",
        claves: ".net racha temario",
        icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z M3 20h4",
        label: "Aprendizaje",
      },
    ],
  },
  {
    title: "Lab",
    links: [
      {
        href: "/admin/lab/pipeline",
        claves: "ci cd github actions despliegues",
        icon: "M4 4m-2 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M4 6v12a2 2 0 0 0 2 2h3 M9 20l3-3-3-3 M20 12m-2 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M20 14v3a2 2 0 0 1-2 2h-4 M4 6h9 M13 4l3 2-3 2",
        label: "Pipeline CI/CD",
      },
      {
        href: "/admin/lab/payments-lab",
        claves: "wompi pasarela pagos prueba",
        icon: "M19 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z M3 10h18 M7 15h4",
        label: "Payments Lab",
      },
      {
        href: "/admin/lab/chaos",
        claves: "fallas inyección",
        icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
        label: "Chaos",
      },
      {
        href: "/admin/lab/slo",
        claves: "presupuesto de errores disponibilidad",
        icon: "M12 20V10 M18 20V4 M6 20v-4 M3 20h18",
        label: "SLO / Budget",
      },
      {
        href: "/admin/lab/security",
        claves: "vulnerabilidades accesibilidad npm audit codeql",
        icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
        label: "Seguridad & a11y",
      },
      {
        href: "/admin/lab/load",
        claves: "k6 carga rendimiento",
        icon: "M3 3v18h18 M7 15l4-6 4 4 5-8",
        label: "Load testing",
      },
      {
        href: "/admin/lab/cv-downloads",
        claves: "hoja de vida currículum",
        icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
        label: "Descargas CV",
      },
    ],
  },
  {
    title: "Documentación",
    links: [
      {
        href: "/docs",
        claves: "requisitos casos de uso diagramas",
        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
        label: "Documentación",
      },
    ],
  },
  {
    title: "Sistema",
    links: [
      {
        href: "/admin/backup",
        claves: "respaldo copia de seguridad",
        icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
        label: "Backups",
      },
      {
        href: "/admin/sessions",
        claves: "sesiones dispositivos",
        icon: "M12 18h.01 M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
        label: "Dispositivos",
      },
      {
        href: "/admin/passkeys",
        claves: "webauthn llaves",
        icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
        label: "Llaves de seguridad",
      },
      {
        href: "/admin/security",
        claves: "ataques bloqueos ips siem",
        icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
        label: "Seguridad",
      },
      {
        href: "/admin/analista",
        claves: "ia seguridad análisis",
        icon: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 16v5 M16.5 18.5h5",
        label: "Analista IA",
      },
      {
        href: "/admin/settings",
        claves: "configuración emisor datos",
        icon: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
        label: "Ajustes",
      },
    ],
  },
];
