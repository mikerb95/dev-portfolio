// Motion del asesor de la burbuja (WhatsappFab.astro). Lo importa el chat de
// forma diferida, al abrirse: la burbuja está en todas las páginas y la
// mayoría de visitas nunca abre el chat, así que GSAP no viaja con ella.
//
// Dos gestos, ambos ya existentes en el sitio:
//  · la respuesta se escribe palabra a palabra (texto-generado.ts, el mismo
//    del borrador de la mesa de trabajo en /capacitacion-ia);
//  · las cifras que salieron de la calculadora ruedan como un odómetro y
//    aparece la marca "Calculado con el tarifario". Así el chat muestra lo
//    que promete (el precio no lo inventa el modelo) en vez de solo decirlo.
//
// Quien llama decide si hay movimiento (prefers-reduced-motion): aquí no se
// vuelve a comprobar. Módulo solo de navegador.

import gsap from 'gsap'
import { armarOdometro, rodarOdometro } from './odometro'
import { pintarRespuesta } from './palabras'
import { generar, GENERADO } from './texto-generado'

/** Duración máxima de la escritura, por larga que sea la respuesta. */
const TOPE_ESCRITURA = 2.2

/**
 * Escribe la respuesta en `p` y, si trae cifras calculadas, las hace rodar y
 * enciende la marca. Al terminar, cada precio vuelve a ser texto plano (se
 * puede seleccionar y copiar, y el lector de pantalla lo lee normal).
 */
export function animarRespuesta(p: HTMLElement, texto: string, cifras: string[], marca: HTMLElement | null): void {
  const precios = pintarRespuesta(p, texto, cifras)
  const palabras = Array.from(p.querySelectorAll<HTMLElement>('.mw'))
  const paso = Math.min(GENERADO.paso, TOPE_ESCRITURA / Math.max(1, palabras.length))
  generar(palabras, { tope: TOPE_ESCRITURA })
  const fin = GENERADO.duracion + paso * palabras.length

  for (const { el, indice } of precios) {
    const valor = el.textContent ?? ''
    const tiras = armarOdometro(el)
    // Rueda en cuanto su palabra empieza a aparecer, no al final: así se lee
    // como un número que se está calculando delante de la persona.
    const tweens = rodarOdometro(tiras, { duracion: 0.9, escalon: 0.06, retraso: indice * paso, recorrido: 5 })
    const total = Math.max(...tweens.map((t) => t.delay() + t.duration()))
    gsap.delayedCall(total, () => {
      el.textContent = valor
      el.removeAttribute('aria-label')
    })
  }

  if (marca) {
    const punto = marca.querySelector<HTMLElement>('.asesor-marca-punto')
    gsap.set(marca, { opacity: 0, y: 4 })
    gsap
      .timeline({ delay: fin })
      .to(marca, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out', clearProps: 'opacity,transform' })
      .fromTo(punto, { scale: 0.2 }, { scale: 1, duration: 0.5, ease: 'back.out(3)', clearProps: 'transform' }, 0.05)
  }
}
