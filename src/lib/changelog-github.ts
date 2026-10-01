// Lectura de los commits de main para /changelog. Solo servidor.
//
// FAIL-OPEN: si GitHub no responde o se acaba la cuota, devuelve null y la
// página lo dice; nunca un 500. La caché en memoria evita repetir el rastreo
// en cada visita mientras la instancia siga viva (Fluid Compute las reutiliza);
// la CDN ya pone otros 5 minutos delante.
import { serverEnv } from './env'
import type { CommitCrudo } from './changelog'

const REPO = 'mikerb95/dev-portfolio'
const CACHE_MS = 10 * 60_000
// ~20 commits al día: 8 semanas son unas 1.100 filas, 11 páginas de 100.
// El tope protege la cuota si un día el ritmo se dispara.
const MAX_PAGINAS = 12

let cache: { hasta: number; commits: CommitCrudo[] } | null = null

type GhCommit = { sha: string; commit: { message: string; committer?: { date?: string }; author?: { date?: string } } }

export async function commitsRecientes(semanas = 8, ahora = Date.now()): Promise<CommitCrudo[] | null> {
  if (cache && cache.hasta > ahora) return cache.commits
  const desde = new Date(ahora - semanas * 7 * 86_400_000).toISOString()
  const token = serverEnv('GITHUB_TOKEN')
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const url = (pagina: number) =>
    `https://api.github.com/repos/${REPO}/commits?sha=main&since=${desde}&per_page=100&page=${pagina}`
  const leer = async (res: Response) => {
    const lote = (await res.json()) as GhCommit[]
    return lote.flatMap((c) => {
      const fecha = c.commit.committer?.date ?? c.commit.author?.date
      return fecha ? [{ sha: c.sha, mensaje: c.commit.message, fecha }] : []
    })
  }
  try {
    // La primera página dice en su cabecera Link cuántas hay; el resto se pide
    // en paralelo. Una por una eran 11 viajes seguidos: 9 s en frío.
    const primera = await fetch(url(1), { headers, signal: AbortSignal.timeout(6000) })
    if (!primera.ok) return null
    const commits = await leer(primera)
    const ultima = Number(/[?&]page=(\d+)>;\s*rel="last"/.exec(primera.headers.get('link') ?? '')?.[1] ?? 1)
    const resto = Array.from({ length: Math.min(ultima, MAX_PAGINAS) - 1 }, (_, i) => i + 2)
    const lotes = await Promise.all(
      resto.map((n) =>
        fetch(url(n), { headers, signal: AbortSignal.timeout(6000) })
          .then((r) => (r.ok ? leer(r) : []))
          .catch(() => [] as CommitCrudo[])
      )
    )
    // Una página que falle deja un hueco en semanas viejas, no tumba la página.
    return guardar(commits.concat(...lotes), ahora)
  } catch {
    return null
  }
}

function guardar(commits: CommitCrudo[], ahora: number) {
  cache = { hasta: ahora + CACHE_MS, commits }
  return commits
}
