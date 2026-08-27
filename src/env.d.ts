declare namespace App {
  interface Locals {
    /**
     * El request entró con un pase de demo (sin sesión real): datos ficticios y
     * solo lectura. Lo fija el middleware; las páginas de /admin lo usan para
     * mostrar el aviso y ocultar acciones. Ver src/lib/demo.ts.
     */
    demo?: boolean

    /**
     * Sesión del portal de clientes, resuelta por el middleware para todo
     * request bajo /portal. Las páginas la leen de aquí en vez de volver a
     * consultar la base: el middleware ya pagó ese coste y ya validó que el
     * usuario esté activo y que su cliente tenga el portal habilitado.
     *
     * El tipo real es PortalSession (src/lib/portal/session.ts); aquí se
     * declara estructuralmente para no arrastrar un import a un archivo global.
     */
    portal?: {
      sessionId: string
      user: { id: number; email: string; name: string | null; role: 'owner' | 'member' | 'billing' }
      client: { id: number; name: string; company: string | null; logoUrl: string | null }
      impersonatedBy: string | null
    }

    /**
     * La sesión del portal de arriba es la de demo pública (pase anónimo, base
     * de datos de demo). El layout la usa para mostrar el aviso; lo que de
     * verdad impide tocar datos reales es que las queries salen de otra base
     * (ver src/lib/portal/demo.ts).
     */
    portalDemo?: boolean
    /** El portal se está sirviendo del snapshot versionado (base caída). */
    portalRespaldo?: boolean
  }
}

interface Window {
  /**
   * Anuncia un mensaje en la región `aria-live` del portal. Lo define un script
   * `is:inline` de PortalLayout (ver el porqué allí), así que puede no existir
   * si ese layout no es el que está en pantalla: los llamadores usan
   * `window.portalAnnounce?.(...)`, porque anunciar es una cortesía y jamás
   * debe ser lo que rompa una interacción que ya funciona.
   */
  portalAnnounce?: (message: string) => void
}
