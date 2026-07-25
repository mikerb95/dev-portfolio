import type es from './es'

// `satisfies typeof es` obliga a TypeScript a marcar error si falta o sobra
// una clave respecto al diccionario fuente. No es solo tipado: es el
// mecanismo de paridad. Reforzado por tests/i18n-dictionary.test.ts (que
// además detecta valores idénticos al español — traducción olvidada).
const en = {
  common: {
    back: 'Back',
    good: 'good',
    needsImprovement: 'needs improvement',
    poor: 'poor',
  },
  meta: {
    siteName: 'CodeByMike',
    defaultDescription: 'Software Engineer focused on scalability, performance, and world-class user experience.',
  },
  nav: {
    diseno: 'Web Design',
    tools: 'Tools',
    engineering: 'Engineering',
    lab: 'Lab',
    notes: 'Notes',
    security: 'Security',
    log: 'Log',
    available: 'Available',
    loginAria: 'Login',
    contactCta: 'Get in touch',
    languageSwitch: 'Español',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  footer: {
    tagline: 'Software Engineer. Scalable architecture, obsessive performance, and world-class user experiences.',
    groups: {
      sitio: { title: 'Site', inicio: 'Home', contacto: 'Contact' },
      producto: {
        title: 'Product',
        herramientas: 'Tools',
        notas: 'Notes',
        docs: 'Documentation',
        certificaciones: 'Certifications',
      },
      ingenieria: {
        title: 'Engineering',
        ingenieria: 'Engineering',
        arquitectura: 'Architecture',
        seguridad: 'Security',
        laboratorio: 'Lab',
      },
      operacion: { title: 'Operations', log: 'Log', status: 'Status' },
      redes: { title: 'Social' },
      contacto: { title: 'Direct contact' },
    },
  },
  notFound: {
    title: '404 — CodeByMike',
    description: 'The page you are looking for does not exist or is no longer available.',
    eyebrow: 'Error 404',
    headingA: 'Page',
    headingB: 'not found',
    body: 'The route you are trying to visit does not exist or its content is no longer available.',
    cta: 'Back to home',
  },
  home: {
    title: 'CodeByMike | Mike — Software Engineer',
    description:
      'Mike — Software Engineer based in Colombia (remote). TypeScript, React, Next.js, Astro, Node.js and PostgreSQL. Scalable products, robust architecture, and obsessive performance.',
    badge: 'Available · Colombia · Remote',
    githubTop3Label: 'GitHub Colombia',
    githubTop3Value: 'Contributor',
    githubDevProgramLabel: 'Official member',
    githubDevProgramValue: 'Developer Program',
    hud: {
      title: 'sys.monitor',
      boot: 'boot',
      sistema: 'system',
      build: 'build',
      pipeline: 'pipeline',
      stack: 'stack',
      lab: 'lab',
    },
    hero: {
      line1: 'Software',
      line2: 'engineering',
      line3: 'with purpose.',
      lead: "I'm Mike — a Software Engineer building scalable products for teams that can't afford to guess. Robust architecture, obsessive performance, world-class experiences.",
      stackLabel: 'Core stack',
      stackLine1: 'TypeScript · React · Next.js',
      stackLine2: 'Astro · Node.js · PostgreSQL',
      ctaProjects: 'View projects',
      ctaCerts: 'Certifications',
      ctaContact: "Let's talk",
    },
    bento: {
      sectionLabel: 'What I do',
      about: {
        badge: 'Practice',
        title: "I design the architecture that scales your product. And I build it.",
        statYears: 'Years exp.',
        statProjects: 'Projects',
        statIndustries: 'Industries',
      },
      now: {
        badge: 'Now',
        body: 'Building full-stack products with Astro + Next.js and serverless architecture.',
      },
      capabilities: {
        badge: 'Capabilities',
        items: [
          'Scalable architecture · Full-stack',
          'REST APIs · GraphQL · tRPC',
          'Performance · Core Web Vitals',
          'Testing · Unit · E2E · TypeScript',
        ],
      },
      location: { badge: 'Based in', country: 'Colombia', tz: 'GMT−5 · Global remote' },
      contactMicro: {
        badge: 'Inbound',
        body: 'First response within 24h · Mon–Fri.',
        note: 'Projects evaluated for fit and timing.',
        cta: 'Brief',
      },
      github: { user: 'mikerb95', note: 'Open source · daily commits', cta: 'View profile' },
    },
    proyectos: { sectionLabel: 'Selected work', title: 'Projects in production.' },
    proceso: {
      sectionLabel: 'How I work',
      title: 'A four-step process, calibrated to your pace.',
      steps: [
        { t: 'Diagnosis', d: 'Two weeks listening — every flow, every spreadsheet, every workaround.', time: 'Wk 1–2' },
        { t: 'Architecture', d: 'Mapping product decisions. What is critical vs. cosmetic.', time: 'Wk 3' },
        { t: 'Prototype', d: 'Real React, real data, real constraints. Tested with end users.', time: 'Wk 4–8' },
        { t: 'Ship & mentoring', d: 'I build alongside your team. I leave them a system they can scale.', time: 'Wk 9+' },
      ],
    },
    expertise: {
      sectionLabel: 'Technical expertise',
      items: [
        { title: 'Scalable Architecture', body: 'I design distributed, modular systems built to grow. Monorepos, robust APIs, and solid design patterns.' },
        { title: 'Performance First', body: 'Speed is a feature. I optimize Core Web Vitals, API response times, and database efficiency.' },
        { title: 'Code Quality', body: 'Rigorous testing (Unit, E2E), strict static typing, and clear documentation. Maintainable code is profitable code.' },
      ],
    },
    lab: {
      sectionLabel: 'Live lab',
      badge: 'Interactive demo · security',
      titleLine1: 'Hall of mirrors:',
      titleLine2: 'I recognize you without cookies.',
      p1a: 'I built a ',
      p1strong: 'device fingerprinting',
      p1b:
        ' lab to make visible something almost no one sees: your browser exposes dozens of signals —canvas, GPU, fonts, audio— that together form an almost unique fingerprint. Scan a QR code, join a room, and a live board identifies you ',
      p1strong2: 'without login and without cookies',
      p1c: '.',
      p2a: 'The goal? To make you ',
      p2em: 'feel',
      p2b:
        ' it: go incognito, clear your cookies, and come back. It recognizes you all the same. And it ends by teaching you how to defend yourself. A demo that explains privacy and tracking without slides.',
      cta: 'Enter the lab',
      note: 'Ephemeral · no PII · rooms are wiped after 2h',
      points: [
        { title: 'Scan and join', body: 'Several devices link to the same room via a QR code — like a classroom or a live event.' },
        { title: 'It recognizes you, it does not log you in', body: 'A custom collector cross-checked against FingerprintJS. Come back incognito and the revisit counter still goes up.' },
        { title: 'Learn to defend yourself', body: "Ends by explaining why incognito isn't enough and what actually works: Tor, resistFingerprinting, and more." },
      ],
    },
  },
} satisfies typeof es

export default en
