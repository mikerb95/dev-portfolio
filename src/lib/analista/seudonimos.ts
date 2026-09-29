// Seudónimos de IP para el analista del micro-SIEM.
//
// El modelo nunca recibe una IP en claro: cada IP se cambia por un alias
// estable durante la sesión ("origen-01", "origen-02"…), y la traducción de
// vuelta solo ocurre aquí, en el proceso local, cuando el administrador
// aprueba un bloqueo. Dos razones: minimización de datos (una IP es dato
// personal y el análisis no la necesita para razonar) y OPSEC (el agente se
// enseña en vivo, en pantalla, y la regla del repo es no publicar IPs).
//
// En producción la tabla de alias se guarda en la base con la ejecución (una
// aprobación puede llegar horas después, en otra función), pero solo del lado
// del servidor: nunca viaja al navegador ni al modelo.
//
// Módulo puro: sin BD ni red, para poder probarlo aislado.

export class Seudonimos {
  private porIp = new Map<string, string>()
  private porAlias = new Map<string, string>()

  /** Reconstruye la tabla guardada (alias → IP) de una ejecución anterior. */
  static desde(guardado: Record<string, string> | null | undefined, enClaro = false): Seudonimos {
    const s = new Seudonimos(enClaro)
    for (const [alias, ip] of Object.entries(guardado ?? {})) {
      s.porAlias.set(alias, ip)
      s.porIp.set(ip, alias)
    }
    return s
  }

  /** Tabla alias → IP para guardarla con la ejecución. */
  exportar(): Record<string, string> {
    return Object.fromEntries(this.porAlias)
  }

  /**
   * @param enClaro si es true, el alias ES la IP (modo depuración local,
   *   nunca para una demo en pantalla).
   */
  constructor(private readonly enClaro = false) {}

  /** Alias de una IP; lo crea en el orden en que aparece por primera vez. */
  alias(ip: string | null | undefined): string {
    if (!ip) return 'desconocido'
    if (this.enClaro) return ip
    const existente = this.porIp.get(ip)
    if (existente) return existente
    const nuevo = `origen-${String(this.porIp.size + 1).padStart(2, '0')}`
    this.porIp.set(ip, nuevo)
    this.porAlias.set(nuevo, ip)
    return nuevo
  }

  /**
   * IP real detrás de un alias, o null si el alias no salió de esta sesión.
   * Un alias inventado por el modelo no se puede resolver: el agente solo
   * puede actuar sobre orígenes que de verdad vio en los datos.
   */
  ip(alias: string): string | null {
    const limpio = alias.trim()
    if (this.enClaro) return limpio || null
    return this.porAlias.get(limpio) ?? null
  }
}
