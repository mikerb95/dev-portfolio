// Mermaid con el tema del sitio (RF-043). Lo usan las páginas de /docs que
// siguen en Mermaid (secuencia, clases, objetos, paquetes).
//
// Mermaid no lee variables CSS: sus colores van en `themeVariables` como hex y
// se queman en el SVG al pintar. Por eso hay una paleta por tema y, al cambiar
// de tema, se repinta desde la fuente original de cada diagrama (Mermaid
// reemplaza el texto del <pre> por el SVG, así que se guarda antes).
import mermaid from 'mermaid'
import { alCambiarTema, temaActual, type Tema } from './tema'

// Los valores de la versión oscura son los que cada página tenía escritos a
// mano: así el oscuro queda idéntico.
const OSCURO = {
  background: '#13131a',
  primaryColor: '#1c1c26',
  primaryTextColor: '#e7e7ec',
  primaryBorderColor: '#6a6a7a',
  lineColor: '#c4c4cc',
  secondaryColor: '#171720',
  tertiaryColor: '#0e0e12',
  textColor: '#e7e7ec',
  edgeLabelBackground: '#13131a',
  classText: '#e7e7ec',
  clusterBkg: '#0e0e12',
  clusterBorder: '#3a3a48',
  actorBkg: '#1c1c26',
  actorBorder: '#6a6a7a',
  actorTextColor: '#e7e7ec',
  actorLineColor: '#85858f',
  signalColor: '#c4c4cc',
  signalTextColor: '#e7e7ec',
  labelBoxBkgColor: '#1c1c26',
  labelBoxBorderColor: '#6a6a7a',
  labelTextColor: '#e7e7ec',
  loopTextColor: '#e7e7ec',
  noteBkgColor: '#24242f',
  noteTextColor: '#e7e7ec',
  noteBorderColor: '#6a6a7a',
  activationBkgColor: '#24242f',
  activationBorderColor: '#6a6a7a',
}

// Papel: cajas apenas grises sobre blanco, trazos de tinta. Mismo papel que
// cumple cada valor en la versión oscura, no su inverso uno a uno.
const CLARO: typeof OSCURO = {
  background: '#ffffff',
  primaryColor: '#f4f4f7',
  primaryTextColor: '#0a0a0d',
  primaryBorderColor: '#74747f',
  lineColor: '#2e2e3a',
  secondaryColor: '#ececf1',
  tertiaryColor: '#f6f6f9',
  textColor: '#0a0a0d',
  edgeLabelBackground: '#ffffff',
  classText: '#0a0a0d',
  clusterBkg: '#f6f6f9',
  clusterBorder: '#a9a9b5',
  actorBkg: '#f4f4f7',
  actorBorder: '#74747f',
  actorTextColor: '#0a0a0d',
  actorLineColor: '#5a5a66',
  signalColor: '#2e2e3a',
  signalTextColor: '#0a0a0d',
  labelBoxBkgColor: '#f4f4f7',
  labelBoxBorderColor: '#74747f',
  labelTextColor: '#0a0a0d',
  loopTextColor: '#0a0a0d',
  noteBkgColor: '#e6e6ec',
  noteTextColor: '#0a0a0d',
  noteBorderColor: '#74747f',
  activationBkgColor: '#e6e6ec',
  activationBorderColor: '#74747f',
}

type Despues = (svgs: SVGSVGElement[], fuentes: string[], tema: Tema) => void

/**
 * Pinta todos los `pre.mermaid` de la página con el tema actual y los repinta
 * cuando cambia. `despues` corre tras cada pintado (también tras un repintado),
 * para los retoques que una página hace sobre el SVG ya generado.
 */
export async function montarMermaid(despues?: Despues): Promise<void> {
  const pres = [...document.querySelectorAll<HTMLElement>('pre.mermaid')]
  if (!pres.length) return
  const fuentes = pres.map((p) => p.textContent ?? '')

  // Un repintado que empieza mientras otro sigue en curso se encadena detrás:
  // dos `mermaid.run` sobre los mismos nodos a la vez se pisan los ids.
  let cola: Promise<void> = Promise.resolve()

  const pintar = (tema: Tema) => {
    cola = cola.then(async () => {
      mermaid.initialize({
        startOnLoad: false,
        theme: tema === 'claro' ? 'base' : 'dark',
        securityLevel: 'loose',
        themeVariables: tema === 'claro' ? CLARO : OSCURO,
      })
      pres.forEach((p, i) => {
        p.removeAttribute('data-processed')
        p.textContent = fuentes[i] ?? ''
      })
      await mermaid.run({ nodes: pres })
      const svgs = pres.map((p) => p.querySelector('svg')).filter((s): s is SVGSVGElement => !!s)
      despues?.(svgs, fuentes, tema)
    })
    return cola
  }

  alCambiarTema((t) => void pintar(t))
  await pintar(temaActual())
}
