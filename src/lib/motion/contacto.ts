// Motion de /contact. Solo anima lo que la página ya tiene: no agrega
// piezas, no cambia textos ni estilos, y el formulario sigue funcionando igual
// sin JS o con movimiento reducido.
//   · entrada: la etiqueta se traza, el titular se destapa, la
//     columna izquierda y el formulario entran escalonados;
//   · formulario: las pistas de cada campo aparecen cuando cambia su estado
//     (no en cada tecla), el contador de campos gira al cambiar;
//   · envío: el botón late mientras viaja y el estado se destapa al llegar.
//
// Módulo solo de navegador.

import gsap from 'gsap'
import { montarLanding } from './landing'

/** Corre `fn` cada vez que cambia el texto o la clase de `el`. */
function alCambiar(el: Element, fn: () => void) {
  new MutationObserver(fn).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] })
}

function entrada() {
  const etiqueta = document.querySelector<HTMLElement>('[data-ct-etiqueta]')
  if (etiqueta) {
    const [codigo, raya, rotulo] = Array.from(etiqueta.children) as HTMLElement[]
    gsap
      .timeline({ delay: 0.05 })
      .from(codigo, { opacity: 0, x: -10, duration: 0.6, ease: 'power3.out' })
      .from(raya, { scaleX: 0, transformOrigin: '0 50%', duration: 0.9, ease: 'expo.out', clearProps: 'transform' }, 0.1)
      .from(rotulo, { opacity: 0, x: -8, duration: 0.6, ease: 'power3.out', clearProps: 'transform,opacity' }, 0.35)
  }

  // El titular entra entero, destapado de abajo arriba. Partirlo en palabras
  // le daría a cada una su propio degradado y cambiaría cómo se ve: el
  // degradado de la página va sobre el bloque completo.
  const titulo = document.querySelector<HTMLElement>('[data-ct-titulo]')
  if (titulo) {
    gsap.fromTo(
      titulo,
      { clipPath: 'inset(0% 0% 100% 0%)', y: 28 },
      { clipPath: 'inset(-10% 0% -10% 0%)', y: 0, duration: 1.2, ease: 'expo.out', delay: 0.15, clearProps: 'clipPath,transform' },
    )
  }

  const lista = document.querySelector<HTMLElement>('[data-ct-lista]')
  if (lista) {
    gsap.from(lista.children, { opacity: 0, x: -12, duration: 0.8, ease: 'expo.out', stagger: 0.08, delay: 0.65, clearProps: 'transform,opacity' })
  }

  const tarjeta = document.querySelector<HTMLElement>('[data-ct-form]')
  const form = document.getElementById('contact-form')
  if (tarjeta) gsap.from(tarjeta, { y: 36, opacity: 0, duration: 1.2, ease: 'expo.out', delay: 0.3, clearProps: 'transform,opacity' })
  if (form) gsap.from(form.children, { y: 14, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06, delay: 0.55, clearProps: 'transform,opacity' })
}

function formulario() {
  // Pistas: se animan cuando el campo cambia de estado (vacío, inválido,
  // válido), no con cada carácter del contador del mensaje.
  document.querySelectorAll<HTMLElement>('[id^="hint-"]').forEach((pista) => {
    let previo = `${pista.className}|${Boolean(pista.textContent)}`
    alCambiar(pista, () => {
      const ahora = `${pista.className}|${Boolean(pista.textContent)}`
      if (ahora === previo) return
      previo = ahora
      if (pista.textContent) gsap.fromTo(pista, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' })
    })
  })

  const contador = document.getElementById('field-count')
  if (contador) {
    let previo = contador.textContent
    alCambiar(contador, () => {
      if (contador.textContent === previo) return
      previo = contador.textContent
      gsap.fromTo(contador, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: 'power3.out', clearProps: 'transform,opacity' })
    })
  }

  const form = document.getElementById('contact-form')
  const boton = document.getElementById('submit-btn')
  const estado = document.getElementById('form-status')
  let latido: gsap.core.Tween | null = null
  form?.addEventListener('submit', () => {
    if (!boton) return
    latido?.kill()
    latido = gsap.to(boton, { opacity: 0.6, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1 })
  })
  if (estado) {
    alCambiar(estado, () => {
      if (estado.classList.contains('hidden') || !estado.textContent) return
      latido?.kill()
      latido = null
      if (boton) gsap.to(boton, { opacity: 1, duration: 0.2, clearProps: 'opacity' })
      gsap.fromTo(
        estado,
        { clipPath: 'inset(0% 100% 0% 0%)', x: -6 },
        { clipPath: 'inset(0% 0% 0% 0%)', x: 0, duration: 0.7, ease: 'expo.out', clearProps: 'clipPath,transform' },
      )
    })
  }
}

export function montarContactoMotion() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  try {
    entrada()
    formulario()
  } catch (err) {
    // Fail-open: lo que haya quedado a medio entrar vuelve a su sitio.
    console.warn('[contacto] motion deshabilitado tras un fallo', err)
    gsap.set('[data-ct-etiqueta] *, [data-ct-lista] > *, [data-ct-form], #contact-form > *', { clearProps: 'all' })
  }
  montarLanding()
}
