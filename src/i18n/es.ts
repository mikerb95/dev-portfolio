// Diccionario fuente (español). `en.ts` se declara `satisfies typeof es` para
// que TypeScript rompa si falta una clave — es la garantía real de paridad,
// reforzada por tests/i18n-dictionary.test.ts.

const es = {
  meta: {
    siteName: 'CodeByMike',
    defaultDescription:
      'Software Engineer especializado en escalabilidad, rendimiento y experiencia de usuario de clase mundial.',
  },
  nav: {
    diseno: 'Diseño Web',
    tools: 'Herramientas',
    engineering: 'Ingeniería',
    lab: 'Lab',
    notes: 'Notas',
    security: 'Seguridad',
    log: 'Log',
    available: 'Disponible',
    loginAria: 'Login',
    contactCta: 'Contáctame',
    languageSwitch: 'English',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
  },
  footer: {
    tagline: 'Software Engineer. Arquitectura escalable, rendimiento obsesivo y experiencias de usuario de clase mundial.',
    groups: {
      sitio: { title: 'Sitio', inicio: 'Inicio', contacto: 'Contacto' },
      producto: {
        title: 'Producto',
        herramientas: 'Herramientas',
        notas: 'Notas',
        docs: 'Documentación',
        certificaciones: 'Certificaciones',
      },
      ingenieria: {
        title: 'Ingeniería',
        ingenieria: 'Ingeniería',
        arquitectura: 'Arquitectura',
        seguridad: 'Seguridad',
        laboratorio: 'Laboratorio',
      },
      operacion: { title: 'Operación', log: 'Log', status: 'Status' },
      redes: { title: 'Redes' },
      contacto: { title: 'Contacto directo' },
    },
  },
  notFound: {
    title: '404 — CodeByMike',
    description: 'La página que buscas no existe o ya no está disponible.',
    eyebrow: 'Error 404',
    headingA: 'Página',
    headingB: 'no encontrada',
    body: 'La ruta que intentas visitar no existe o el contenido ya no está disponible.',
    cta: 'Volver al inicio',
  },
  home: {
    title: 'CodeByMike | Mike — Software Engineer',
    description:
      'Mike — Software Engineer en Colombia (remoto). TypeScript, React, Next.js, Astro, Node.js y PostgreSQL. Productos escalables, arquitectura robusta y rendimiento obsesivo.',
    badge: 'Disponible · Colombia · Remoto',
    githubTop3Label: 'GitHub Colombia',
    githubTop3Value: 'Contributor',
    githubDevProgramLabel: 'Miembro oficial',
    githubDevProgramValue: 'Developer Program',
    hud: {
      title: 'sys.monitor',
      boot: 'boot',
      sistema: 'sistema',
      build: 'build',
      pipeline: 'pipeline',
      stack: 'stack',
      lab: 'lab',
    },
    hero: {
      line1: 'Ingeniería de',
      line2: 'software',
      line3: 'con propósito.',
      lead: 'Soy Mike — un Software Engineer construyendo productos escalables para equipos que no pueden permitirse adivinar. Arquitectura robusta, rendimiento obsesivo, experiencias de clase mundial.',
      stackLabel: 'Stack principal',
      stackLine1: 'TypeScript · React · Next.js',
      stackLine2: 'Astro · Node.js · PostgreSQL',
      ctaProjects: 'Ver proyectos',
      ctaCerts: 'Certificaciones',
      ctaContact: 'Hablemos',
    },
    bento: {
      sectionLabel: 'Qué hago',
      about: {
        badge: 'Práctica',
        title: 'Diseño la arquitectura que escala tu producto. Y la construyo.',
        statYears: 'Años exp.',
        statProjects: 'Proyectos',
        statIndustries: 'Industrias',
      },
      now: {
        badge: 'Ahora',
        body: 'Construyendo productos full-stack con Astro + Next.js y arquitectura serverless.',
      },
      capabilities: {
        badge: 'Capacidades',
        items: [
          'Arquitectura escalable · Full-stack',
          'APIs REST · GraphQL · tRPC',
          'Performance · Core Web Vitals',
          'Testing · Unit · E2E · TypeScript',
        ],
      },
      location: { badge: 'Base', country: 'Colombia', tz: 'GMT−5 · Remoto global' },
      contactMicro: {
        badge: 'Inbound',
        body: 'Primera respuesta en 24 h · L–V.',
        note: 'Proyectos evaluados por fit y timing.',
        cta: 'Brief',
      },
      github: { user: 'mikerb95', note: 'Open source · commits diarios', cta: 'Ver perfil' },
    },
    proyectos: { sectionLabel: 'Trabajo seleccionado', title: 'Proyectos en producción.' },
    proceso: {
      sectionLabel: 'Cómo trabajo',
      title: 'Un proceso en cuatro pasos, calibrado a tu velocidad.',
      steps: [
        { t: 'Diagnóstico', d: 'Dos semanas escuchando — cada flujo, cada hoja de cálculo, cada workaround.', time: 'Sem 1–2' },
        { t: 'Arquitectura', d: 'Mapeo de decisiones del producto. Qué es crítico vs. cosmético.', time: 'Sem 3' },
        { t: 'Prototipo', d: 'React real, datos reales, límites reales. Testeado con los usuarios finales.', time: 'Sem 4–8' },
        { t: 'Ship & mentoring', d: 'Construyo junto a tu equipo. Les dejo un sistema que pueden escalar.', time: 'Sem 9+' },
      ],
    },
    expertise: {
      sectionLabel: 'Expertise técnico',
      items: [
        { title: 'Arquitectura Escalable', body: 'Diseño sistemas distribuidos y modulares pensados para crecer. Monorepos, APIs robustas y patrones de diseño sólidos.' },
        { title: 'Performance First', body: 'La velocidad es una feature. Optimizo Core Web Vitals, tiempos de respuesta de API y eficiencia en bases de datos.' },
        { title: 'Calidad de Código', body: 'Testing riguroso (Unit, E2E), tipado estático estricto y documentación clara. Código mantenible es código rentable.' },
      ],
    },
    lab: {
      sectionLabel: 'Laboratorio en vivo',
      badge: 'Demo interactiva · seguridad',
      titleLine1: 'Sala de espejos:',
      titleLine2: 'te reconozco sin cookies.',
      p1a: 'Construí un laboratorio de ',
      p1strong: 'device fingerprinting',
      p1b:
        ' para hacer visible algo que casi nadie ve: tu navegador expone decenas de señales —canvas, GPU, fuentes, audio— que juntas forman una huella casi única. Escaneas un QR, entras a una sala y un tablero te identifica en vivo ',
      p1strong2: 'sin login y sin cookies',
      p1c: '.',
      p2a: '¿El objetivo? Que lo ',
      p2em: 'sientas',
      p2b:
        ': entra en incógnito, borra tus cookies y vuelve a entrar. Te reconoce igual. Y termina enseñándote cómo defenderte. Un demo para explicar privacidad y rastreo sin diapositivas.',
      cta: 'Entrar al laboratorio',
      note: 'Efímero · sin PII · las salas se borran en 2h',
      points: [
        { title: 'Escanea y entra', body: 'Varios dispositivos se enlazan a la misma sala por un QR — como un aula o un evento en vivo.' },
        { title: 'Te reconoce, no te loguea', body: 'Recolector propio contrastado con FingerprintJS. Si vuelves en incógnito, el contador de revisitas sube.' },
        { title: 'Aprende a defenderte', body: 'Cierra explicando por qué el incógnito no basta y qué sí funciona: Tor, resistFingerprinting y más.' },
      ],
    },
  },
}

export default es
