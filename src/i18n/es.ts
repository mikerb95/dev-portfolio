// Diccionario fuente (español). `en.ts` se declara `satisfies typeof es` para
// que TypeScript rompa si falta una clave — es la garantía real de paridad,
// reforzada por tests/i18n-dictionary.test.ts.

const es = {
  common: {
    back: 'Volver',
    good: 'bueno',
    needsImprovement: 'mejorable',
    poor: 'pobre',
  },
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
  engineering: {
    title: 'Ingeniería — CodeByMike',
    description:
      'Métricas de ingeniería medidas en producción: Core Web Vitals de usuarios reales, resultado del pipeline CI y disponibilidad. Datos vivos y verificables, no afirmaciones.',
    eyebrow: 'Excelencia medida, no afirmada',
    h1Line1: 'La calidad,',
    h1Line2: 'en números.',
    introA: 'Cualquiera puede decir que su código es rápido, probado y confiable. Esta página lo ',
    introEmphasis: 'mide',
    introB:
      ': Web Vitals de visitantes reales, el resultado de mi pipeline de CI y la disponibilidad de mis servicios. Todo sale de datos de producción, en vivo.',
    introHint: 'Pasa el cursor (o el foco) sobre cada tarjeta para ver el detalle.',
    vitals: {
      heading: 'Core Web Vitals · usuarios reales',
      meta: 'p75 · {days}d · {samples} muestras',
      samplesWord: 'muestras',
      empty: 'Aún recolectando telemetría de visitantes reales. Vuelve pronto.',
      explain: {
        LCP: 'tiempo hasta que el elemento más grande del viewport termina de pintar.',
        INP: 'latencia entre una interacción del usuario y el siguiente pintado en pantalla.',
        CLS: 'cuánto se mueven los elementos visibles sin interacción del usuario.',
        FCP: 'tiempo hasta el primer píxel de contenido visible.',
        TTFB: 'tiempo desde la petición hasta el primer byte de respuesta del servidor.',
      },
      good: 'Bueno',
      needsImprovement: 'Mejorable',
      poor: 'Pobre',
      goodThreshold: 'bueno ≤ {value}',
      poorThreshold: 'pobre > {value}',
      trendLabel: 'Últimos 7d:',
      trendVs: 'vs ventana de 30d',
      trendImproves: 'mejora',
      trendWorsens: 'empeora',
      trendStable: 'estable',
      worstPath: 'Ruta más lenta: {path} ({value} p75)',
      measuredWith: 'Medido con la librería oficial web-vitals en el navegador de cada visitante. Sin cookies.',
    },
    pipeline: {
      heading: 'Último pipeline verde',
      testsLabel: 'tests ✓',
      coverageLabel: 'cobertura',
      durationLabel: 'duración',
      streak: '{n} runs verdes seguidos',
      lastRun: 'último run',
      empty: 'El pipeline aún no ha reportado ejecuciones. Se poblará con el próximo deploy.',
      panelTitle: 'Pipeline CI/CD',
      successRate: '{pct}% éxito · últimos {n} runs',
      desc: 'Cada push corre la suite completa (Vitest) en GitHub Actions. Un fallo bloquea el merge; un éxito dispara el deploy y un health check post-despliegue.',
      durationChart: 'Duración · últimos {n} runs',
      coverageDelta: 'Cobertura: {value} pts vs el run exitoso anterior.',
      healthCheckLabel: 'Health check post-deploy:',
      healthOk: 'OK',
      healthFail: 'falló',
      commitLabel: 'commit',
      viewRunCta: 'Ver run en GitHub Actions →',
      liveChecking: 'Verificando en vivo…',
      liveError: 'No se pudo verificar en vivo ahora mismo',
    },
    uptime: {
      heading: 'Disponibilidad · 90 días',
      meta: '{services} servicios monitoreados · {checks} sondeos',
      viewStatusCta: 'Ver status en vivo →',
      panelTitle: 'Disponibilidad',
      cadence: '~1 check cada {n} min/servicio',
      explain: '{pct}% de sondeos exitosos equivale a {time} de indisponibilidad acumulada en 90 días.',
      incidentWord: 'incidente',
      incidentWordPlural: 'incidentes',
      registeredWord: 'registrado',
      registeredWordPlural: 'registrados',
      mttr: 'MTTR {n} min',
    },
    verifiable: {
      heading: 'Compruébalo tú mismo',
      security: { title: 'Auditoría de seguridad', body: 'Hallazgos OWASP reales, cada uno mapeado al commit que lo corrigió.' },
      status: { title: 'Status operacional', body: 'Uptime, latencia y presupuesto de error de mi propia infraestructura.' },
      tools: { title: 'Herramientas internas', body: 'Casos de estudio de lo que construí sobre este mismo sitio.' },
      footnote:
        'Web Vitals recolectados con la librería oficial web-vitals en el navegador de cada visitante, agregados al percentil 75 (el que Google usa para clasificar). Sin cookies ni datos personales.',
    },
    live: {
      agoSeconds: 'hace {n} s',
      agoMinutes: 'hace {n} min',
      agoHours: 'hace {n} h',
      agoDays: 'hace {n} d',
      never: '—',
      vitalsNone: 'Consulta en vivo {ago} · sin muestras aún',
      vitalsSome: 'Consulta en vivo {ago} · última muestra {metric} {sampleAgo} · {count} en 24 h',
      uptimeNone: 'Consulta en vivo {ago} · sin sondeos aún',
      uptimeSome: 'Consulta en vivo {ago} · último sondeo {checkAgo} ({name} · {status} · {ms} ms) · {count} en 24 h',
      ciNone: 'Consulta en vivo {ago} · sin runs aún',
      ciSome: 'Consulta en vivo {ago} · último run {runAgo} ({conclusion} · {sha})',
    },
  },
  tools: {
    title: 'Herramientas — CodeByMike',
    description:
      'Casos de estudio de las herramientas que construí para operar mis proyectos y clientes: monitoreo con SLOs, P&L por proyecto, bóveda cifrada, CI/CD con rollback y chaos engineering.',
    eyebrow: 'Herramientas a medida',
    h1Line1: 'Las herramientas con las',
    h1Line2: 'que opero mis proyectos.',
    intro:
      'No uso estas herramientas porque estén de moda: las construí porque las necesitaba. Monitoreo, finanzas, seguimiento de clientes, seguridad y despliegues — todo corre sobre este mismo sitio. Cada caso de estudio cuenta el problema real que lo originó y cómo lo resolví. La misma disciplina que aplico aquí es la que recibe cada cliente.',
    problemLabel: 'El problema',
    solutionLabel: 'La solución',
    mockCaption: 'Recreación del panel con datos ilustrativos — los datos reales no se publican.',
    inProductionLabel: 'En producción',
    demoPortal: {
      eyebrow: 'Portal de clientes',
      title: 'Así es el panel que le entrego a cada cliente',
      body: 'Estado del proyecto con uptime real, facturas que se pagan en línea, mensajería directa y documentos. Entra sin registro: son datos de un cliente inventado, y puedes probar el pago con la pasarela simulada.',
      cta: 'Probar el portal demo',
    },
    closing: {
      quote: 'La herramienta que uso contigo es la que uso conmigo.',
      body: 'Si trabajamos juntos, tu proyecto entra a este mismo sistema: monitoreo con SLOs, seguimiento visible, credenciales cifradas y despliegues con red de seguridad.',
      cta: 'Hablemos de tu proyecto',
    },
    cases: [
      {
        title: 'Monitoreo, SLOs y error budgets',
        tagline: 'Observabilidad estilo SRE, construida desde cero',
        problema:
          'Operar sitios de clientes sin saber si están caídos hasta que alguien avisa. Los servicios de uptime genéricos no detectan un deploy roto que responde 200 con la página equivocada.',
        solucion:
          'Un motor de checks propio: cada sondeo valida código HTTP, contenido esperado en la respuesta y umbral de latencia. Los fallos se agrupan en incidentes (del primer fallo al primer éxito) y sobre el historial se calculan SLOs y presupuestos de error al estilo Google SRE.',
        detalle: [
          'SLO por servicio con burn rate: no solo "cuánto cayó", sino a qué velocidad se consume el presupuesto de error.',
          'Alertas push instantáneas al móvil vía ntfy cuando un servicio cae o se degrada.',
          'Vigilancia de expiración de certificados TLS y de dominios.',
          'Los datos alimentan la página pública de status: lo que ves ahí es lo mismo que veo yo.',
        ],
        liveLabel: 'Ver el status público en vivo',
      },
      {
        title: 'Costos y P&L por proyecto',
        tagline: 'Saber qué cuesta operar cada cosa, al centavo',
        problema:
          'Hosting, dominios, base de datos, email: cada proyecto acumula servicios con facturación distinta. Sin registro, es imposible saber si un proyecto es rentable o cuánto cuesta mantenerlo al año.',
        solucion:
          'Un registro de servicios por proyecto (y a nivel de cuenta) con su costo y ciclo de facturación, cruzado con ingresos cobrados, pendientes y proyectados. El resultado es un P&L por proyecto: margen real, no intuición.',
        detalle: [
          'Normalización de ciclos de facturación (mensual, anual) a costo comparable.',
          'Ingresos en tres estados — cobrado, pendiente, proyectado — para separar caja real de expectativa.',
          'La lógica de P&L y manejo de dinero tiene su propia batería de tests unitarios.',
        ],
        liveLabel: 'Ver el P&L en la demo del panel',
      },
      {
        title: 'Portal de seguimiento para clientes',
        tagline: 'Transparencia como práctica, no como promesa',
        problema:
          'El cliente que no sabe en qué va su proyecto pregunta por WhatsApp, y la respuesta se pierde. La confianza se erosiona en el silencio entre actualizaciones.',
        solucion:
          'Cada proyecto tiene una vista de seguimiento donde el cliente ve el avance sin pedirlo: hitos, interacciones y briefings. Las páginas públicas de proyecto muestran solo lo que está marcado como visible; el resto queda en el panel.',
        detalle: [
          'Registro de interacciones por cliente: qué se habló, qué se acordó, cuándo.',
          'Briefings estructurados que documentan los requisitos antes de escribir código.',
          'Control fino de visibilidad: cada dato decide si es público, del cliente o interno.',
        ],
        liveLabel: null,
      },
      {
        title: 'Bóveda cifrada de credenciales',
        tagline: 'Los secretos de los proyectos, nunca en texto plano',
        problema:
          'Las credenciales de cada proyecto (API keys, variables de entorno) suelen terminar en notas, chats o archivos sueltos: el peor lugar posible.',
        solucion:
          'Una bóveda dentro del panel que cifra cada valor con AES-256-GCM antes de tocar la base de datos. La clave de cifrado vive fuera de la BD, en el entorno del servidor: un volcado de la base de datos no expone ningún secreto.',
        detalle: [
          'Cifrado autenticado (GCM): un valor alterado no se descifra en silencio, falla.',
          'Backups del panel que preservan el cifrado: los secretos viajan cifrados también en el respaldo.',
          'La ruta /admin exige sesión con allowlist revalidada en cada request, en cada capa.',
        ],
        liveLabel: null,
      },
      {
        title: 'CI/CD con health check y rollback',
        tagline: 'Desplegar sin miedo porque el pipeline vigila',
        problema:
          'Un deploy que pasa los tests todavía puede romper producción. Si nadie mira en los minutos siguientes, el sitio queda caído hasta que alguien lo nota.',
        solucion:
          'El pipeline de GitHub Actions despliega, verifica la salud del sitio en vivo y, si el health check falla, revierte automáticamente al deploy anterior. Cada run reporta su resultado al panel, que guarda el historial: éxito, fallo o rollback.',
        detalle: [
          'Health check post-deploy contra el sitio real, no contra un mock.',
          'Rollback automático sin intervención humana cuando la verificación falla.',
          'Historial de runs en el panel con enlace directo a los logs de cada ejecución.',
        ],
        liveLabel: 'Ver el laboratorio en vivo',
      },
      {
        title: 'Chaos engineering controlado',
        tagline: 'Romper el sitio a propósito para confiar en las alertas',
        problema:
          '¿Cómo sabes que tu monitoreo detecta una caída si nunca has visto una? Confiar en alertas que jamás se han disparado es fe, no ingeniería.',
        solucion:
          'Un módulo de inyección de fallos activable desde el panel: latencia extra, errores 500 o servicio muerto, por ruta. Sirve para verificar de punta a punta que los monitores detectan, el incidente se registra y la alerta llega al móvil.',
        detalle: [
          'Fail-open por diseño: si el motor de caos falla, el request pasa limpio. El caos jamás puede volverse un incidente real.',
          'TTL obligatorio en cada flag: ningún fallo inyectado sobrevive más de 15 minutos, ni por olvido.',
          'El panel y la autenticación están excluidos por código: siempre hay un botón de pánico alcanzable.',
        ],
        liveLabel: 'Ver los experimentos en vivo',
      },
      {
        title: 'Observabilidad de seguridad (micro-SIEM propio)',
        tagline: 'Saber quién intenta entrar, no solo esperar a que lo logre',
        problema:
          'Cualquier sitio con IP pública recibe sondeos automáticos desde el primer minuto: CMS ajenos, archivos de configuración, inyecciones en cada parámetro. La reacción normal es ignorar el ruido — pero esos 404 son la superficie de ataque real, y descartarlos es tirar una señal gratis.',
        solucion:
          'Un motor propio que corre en el middleware de cada request: un clasificador alineado con OWASP Top 10 detecta firmas de ataque, un rate limiter durable de dos capas y una lista de bloqueo frenan el abuso, endpoints señuelo confirman intención maliciosa, y un cron horario agrega eventos, detecta anomalías por estadística y aplica bloqueos automáticos escalonados.',
        detalle: [
          'Fail-open en cada capa: si el sensor de seguridad falla, el request pasa limpio — nunca puede tumbar el sitio que protege.',
          'Detección de anomalías con z-score sobre una baseline de 30 días, no una caja negra: cada alerta se puede explicar con una frase.',
          'Bloqueos con TTL obligatorio y escalado por reincidencia (1h → 24h → 7d), nunca eternos por defecto.',
          'La vitrina pública muestra agregados reales con OPSEC deliberada: nunca IPs completas, nunca nombres de reglas, nunca qué rutas son señuelo.',
        ],
        liveLabel: 'Ver Security Operations en vivo',
      },
    ],
  },
}

export default es
