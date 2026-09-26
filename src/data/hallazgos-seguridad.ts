// Metadatos de los hallazgos corregidos que publica /security: commit,
// fecha, clasificación OWASP, severidad y archivo. El texto de cada uno
// (título, problema, corrección) vive en el diccionario (security.findings),
// en el MISMO orden: se unen por índice, y tests/hallazgos-seguridad.test.ts
// fija que las longitudes coincidan para que un commit nunca quede bajo el
// título de otro hallazgo.
//
// Solo entra lo corregido y verificable en el historial público del repo.

export type Severity = 'alta' | 'media'
export type Auditoria = 'jul-2026' | 'sep-2026'
export const HALLAZGOS: { id: string; auditoria: Auditoria; owasp: string; severity: Severity; file: string; commit: string; date: string }[] = [
  { id: 'upload-ext', auditoria: 'jul-2026', owasp: 'A03:2021 · Injection', severity: 'alta', file: 'src/pages/api/admin/upload.ts', commit: 'd439054', date: '2026-07-06' },
  { id: 'contact-abuse', auditoria: 'jul-2026', owasp: 'A04:2021 · Insecure Design', severity: 'media', file: 'src/pages/api/contact.ts', commit: '779f4b0', date: '2026-07-06' },
  { id: 'legacy-session', auditoria: 'jul-2026', owasp: 'A01:2021 · Broken Access Control', severity: 'media', file: 'src/middleware.ts', commit: '14b08e2', date: '2026-07-06' },
  { id: 'missing-headers', auditoria: 'jul-2026', owasp: 'A05:2021 · Security Misconfiguration', severity: 'media', file: 'src/middleware.ts', commit: '32bcf0d', date: '2026-07-06' },
  // Auditoría del panel, 22-24 sep 2026. El commit es el que cerró cada
  // hallazgo, aunque su título hable de otra cosa (5ccb7ec es donde los
  // endpoints salieron de /api/github/). Lo que esa auditoría dejó fuera a
  // propósito no se lista: aquí solo entra lo corregido.
  { id: 'github-endpoints', auditoria: 'sep-2026', owasp: 'A01:2021 · Broken Access Control', severity: 'alta', file: 'src/pages/api/admin/github/toggle.ts', commit: '5ccb7ec', date: '2026-09-22' },
  { id: 'trailing-slash', auditoria: 'sep-2026', owasp: 'A01:2021 · Broken Access Control', severity: 'media', file: 'src/middleware.ts', commit: 'f978724', date: '2026-09-22' },
  { id: 'webauthn-challenge', auditoria: 'sep-2026', owasp: 'A07:2021 · Identification and Authentication Failures', severity: 'media', file: 'src/lib/webauthn.ts', commit: 'f723b6b', date: '2026-09-23' },
  { id: 'passkey-reauth', auditoria: 'sep-2026', owasp: 'A07:2021 · Identification and Authentication Failures', severity: 'media', file: 'src/pages/api/admin/webauthn/registration/verify.ts', commit: 'ddc84af', date: '2026-09-23' },
  { id: 'github-id', auditoria: 'sep-2026', owasp: 'A07:2021 · Identification and Authentication Failures', severity: 'media', file: 'auth.config.ts', commit: 'ddc84af', date: '2026-09-23' },
  { id: 'private-activity', auditoria: 'sep-2026', owasp: 'A01:2021 · Broken Access Control', severity: 'alta', file: 'src/pages/api/github/activity.ts', commit: '1a4ecf7', date: '2026-09-23' },
  { id: 'audit-as-threat', auditoria: 'sep-2026', owasp: 'A04:2021 · Insecure Design', severity: 'media', file: 'src/lib/security/audit.ts', commit: '5bfcfdf', date: '2026-09-24' },
  { id: 'revocation-fail-open', auditoria: 'sep-2026', owasp: 'A07:2021 · Identification and Authentication Failures', severity: 'media', file: 'src/middleware.ts', commit: '5bfcfdf', date: '2026-09-24' },
  { id: 'json-in-script', auditoria: 'sep-2026', owasp: 'A03:2021 · Injection', severity: 'media', file: 'src/lib/json-script.ts', commit: 'f2a9496', date: '2026-09-24' },
]

/** Orden de publicación: la auditoría más reciente primero. */
export const ORDEN_AUDITORIAS: Auditoria[] = ['sep-2026', 'jul-2026']
