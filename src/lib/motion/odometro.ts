// Odómetro: cada dígito de una cifra en una columna que rueda hasta su valor.
// Separado de efectos.ts para que quien solo necesita el odómetro (el asesor
// de la burbuja, que carga en todas las páginas comerciales) no arrastre
// SplitText, ScrollTrigger ni ScrambleText. Los estilos (.odo-col, .odo-tira)
// viven en global.css.
//
// Módulo solo de navegador.

import gsap from 'gsap'

export type Tira = { tira: HTMLElement; digito: number }

/**
 * Convierte el texto de `el` en columnas de dígitos (los demás caracteres
 * quedan fijos). El texto original se conserva en `aria-label` y las columnas
 * quedan fuera del árbol de accesibilidad.
 */
export function armarOdometro(el: HTMLElement): Tira[] {
  const valor = el.textContent?.trim() ?? ''
  if (!/\d/.test(valor)) return []
  el.setAttribute('aria-label', valor)
  el.textContent = ''
  const tiras: Tira[] = []
  for (const ch of valor) {
    if (/\d/.test(ch)) {
      const col = document.createElement('span')
      col.className = 'odo-col'
      col.setAttribute('aria-hidden', 'true')
      const tira = document.createElement('span')
      tira.className = 'odo-tira'
      // Dos vueltas de 0-9: la columna recorre más de una decena antes de
      // asentarse, que es lo que se lee como "rodar" y no como "cambiar".
      tira.textContent = '01234567890123456789'
      col.appendChild(tira)
      el.appendChild(col)
      tiras.push({ tira, digito: Number(ch) })
    } else {
      const s = document.createElement('span')
      s.setAttribute('aria-hidden', 'true')
      s.textContent = ch
      el.appendChild(s)
    }
  }
  return tiras
}

/** Hace rodar las columnas, cada una con su propio retraso. */
export function rodarOdometro(
  tiras: Tira[],
  opciones: { duracion?: number; escalon?: number; retraso?: number; recorrido?: number } = {}
): gsap.core.Tween[] {
  const duracion = opciones.duracion ?? 1.6
  // Sin `recorrido`, cada columna sale de 0 y da más de una vuelta: lee bien
  // en cifras grandes. En texto corrido (14 px) tanto recorrido parpadea, y
  // salir de 0 deja los ceros quietos ("$0.000.000" se lee como un precio):
  // con `recorrido`, cada columna avanza esos dígitos hasta el suyo y todas
  // se mueven a la vez.
  const recorrido = opciones.recorrido
  const escalon = opciones.escalon ?? 0.25
  const retraso = opciones.retraso ?? 0.1
  return tiras.map(({ tira, digito }, i) =>
    gsap.fromTo(
      tira,
      { yPercent: recorrido === undefined ? 0 : -((10 + digito - recorrido) / 20) * 100 },
      {
        yPercent: -((10 + digito) / 20) * 100,
        duration: duracion + i * escalon,
        ease: 'expo.out',
        delay: retraso + i * 0.08,
      }
    )
  )
}
