// Motion de las secciones de /security (bajo el hero). Cada pieza anima DESDE
// cero HASTA el estado que ya pintó el servidor, así que sin JS, con
// movimiento reducido o si algo falla a medio montar, lo que queda en pantalla
// es el dato completo:
//   · desglose y origen: las barras crecen escalonadas
//   · tendencia: las columnas se levantan detrás de un barrido
//   · capas y SLO: la ruta se dibuja y los objetivos se descifran
//   · hallazgos: la línea de commits baja y cierra cada hallazgo al alcanzarlo
//   · controles: cada demostración se repite solo mientras está en pantalla
//   · metodología: la línea une los tres pasos
//
// Módulo solo de navegador.

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);

export function montarSecciones(opciones: { reducido: boolean }): void {
  if (opciones.reducido) return;
  const pasos: [string, () => void, () => void][] = [
    [
      "barras",
      barras,
      () => gsap.set(".so-barra", { clearProps: "transform" }),
    ],
    [
      "tendencia",
      tendencia,
      () => gsap.set(".so-col, [data-barrido]", { clearProps: "all" }),
    ],
    [
      "ruta",
      ruta,
      () =>
        gsap.set("[data-ruta-luz], .so-ruta-paso, .so-slo-guia", {
          clearProps: "all",
        }),
    ],
    ["hallazgos", hallazgos, restaurarHallazgos],
    [
      "controles",
      controles,
      () => gsap.set("[data-demo] *", { clearProps: "all" }),
    ],
    [
      "metodo",
      metodo,
      () => gsap.set("[data-metodo-luz], .me-num", { clearProps: "all" }),
    ],
  ];
  // Fail-open por pieza: una que falla no se lleva a las demás, y devuelve a
  // su sitio lo que pudo quedar escondido.
  for (const [nombre, montar, restaurar] of pasos) {
    try {
      montar();
    } catch (err) {
      console.warn(`[security] ${nombre} sin motion tras un fallo`, err);
      try {
        restaurar();
      } catch {
        // nada más que hacer: el marcado del servidor ya es el estado final
      }
    }
  }
}

/**
 * Dispara `fn` la primera vez que `trigger` cruza `start`. Sin `once: true` a
 * propósito (ver motion-reveal.ts): ScrollTrigger se autodestruye con esa
 * opción, y si ocurre dentro del refresh de otro trigger deja colgado el
 * bucle interno de GSAP y el resto de las secciones nunca entra.
 */
function alEntrar(trigger: Element, start: string, fn: () => void) {
  let hecho = false;
  ScrollTrigger.create({
    trigger,
    start,
    onEnter: () => {
      if (hecho) return;
      hecho = true;
      fn();
    },
  });
}

// ── Desglose y origen ──────────────────────────────────────────────────────

function barras() {
  document.querySelectorAll<HTMLElement>("[data-barras]").forEach((panel) => {
    const bs = panel.querySelectorAll(".so-barra");
    if (!bs.length) return;
    gsap.set(bs, { scaleX: 0 });
    alEntrar(panel, "top 82%", () =>
      gsap.to(bs, {
        scaleX: 1,
        duration: 1.1,
        ease: "expo.out",
        stagger: 0.07,
      }),
    );
  });
}

// ── Tendencia ──────────────────────────────────────────────────────────────

function tendencia() {
  const caja = document.querySelector<HTMLElement>("[data-tend]");
  const barrido = caja?.querySelector<HTMLElement>("[data-barrido]");
  if (!caja || !barrido) return;
  const cols = caja.querySelectorAll<HTMLElement>(".so-col");
  gsap.set(cols, { scaleY: 0 });
  // El barrido y las columnas comparten reloj: cada columna se levanta justo
  // cuando la línea pasa por encima, no con un escalonado independiente.
  const tl = gsap.timeline({ paused: true });
  tl.set(barrido, { opacity: 1, x: 0 })
    .to(barrido, { x: () => caja.clientWidth, duration: 1.4, ease: "none" }, 0)
    .to(
      cols,
      {
        scaleY: 1,
        duration: 0.7,
        ease: "expo.out",
        stagger: 1.4 / cols.length,
      },
      0,
    )
    .to(barrido, { opacity: 0, duration: 0.3 }, 1.3);
  alEntrar(caja, "top 85%", () => tl.play());
}

// ── Capas y SLO ────────────────────────────────────────────────────────────

function ruta() {
  const r = document.querySelector<HTMLElement>("[data-ruta]");
  if (r) {
    const luz = r.querySelector("[data-ruta-luz]");
    const ps = r.querySelectorAll(".so-ruta-paso");
    gsap.set(luz, { scaleY: 0 });
    gsap.set(ps, { opacity: 0, x: -8 });
    alEntrar(r, "top 80%", () => {
      gsap.to(luz, { scaleY: 1, duration: 1.3, ease: "power2.inOut" });
      gsap.to(ps, {
        opacity: 1,
        x: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.3,
        clearProps: "transform,opacity",
      });
    });
  }

  const slo = document.querySelector<HTMLElement>("[data-slo]");
  if (slo) {
    const guias = slo.querySelectorAll(".so-slo-guia");
    const valores = Array.from(
      slo.querySelectorAll<HTMLElement>("[data-slo-valor]"),
    );
    gsap.set(guias, { scaleX: 0 });
    alEntrar(slo, "top 82%", () => {
      gsap.to(guias, {
        scaleX: 1,
        duration: 0.8,
        ease: "power2.out",
        stagger: 0.12,
      });
      valores.forEach((v, i) => {
        const texto = v.textContent ?? "";
        gsap.to(v, {
          duration: 0.9,
          delay: 0.25 + i * 0.12,
          scrambleText: { text: texto, chars: "0123456789<≤%", speed: 0.5 },
        });
      });
    });
  }
}

// ── Hallazgos: la línea de commits cierra cada uno ─────────────────────────

const LINEA_EN = 0.62;

function hallazgos() {
  const lista = document.querySelector<HTMLElement>("[data-hallazgos]");
  if (!lista) return;
  const abierto = lista.dataset.abierto ?? "";
  const corregido = lista.dataset.corregido ?? "";
  const luz = lista.querySelector<HTMLElement>("[data-linea-luz]");

  if (luz) {
    gsap.fromTo(
      luz,
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: lista,
          start: `top ${LINEA_EN * 100}%`,
          end: `bottom ${LINEA_EN * 100}%`,
          scrub: 0.4,
        },
      },
    );
  }

  lista.querySelectorAll<HTMLElement>("[data-hallazgo]").forEach((item) => {
    const nodo = item.querySelector<HTMLElement>("[data-nodo]");
    const chip = item.querySelector<HTMLElement>("[data-chip]");
    if (!nodo || !chip) return;
    const abrir = () => {
      gsap.killTweensOf(chip);
      item.dataset.estado = "abierto";
      chip.textContent = abierto;
    };
    const cerrar = () => {
      if (item.dataset.estado === "corregido") return;
      item.dataset.estado = "corregido";
      item.dataset.cerrando = "";
      window.setTimeout(() => delete item.dataset.cerrando, 900);
      gsap.to(chip, {
        duration: 0.7,
        scrambleText: { text: corregido, chars: "lowerCase", speed: 0.6 },
      });
      gsap.fromTo(
        nodo,
        { scale: 1.7 },
        { scale: 1, duration: 0.7, ease: "back.out(3)" },
      );
    };
    // Lo que ya quedó por encima de la línea al cargar (recarga a media
    // página) se queda corregido: abrirlo y cerrarlo en el acto sería ruido.
    if (nodo.getBoundingClientRect().top > window.innerHeight * LINEA_EN)
      abrir();
    ScrollTrigger.create({
      trigger: nodo,
      start: `top ${LINEA_EN * 100}%`,
      onEnter: cerrar,
      onLeaveBack: abrir,
    });
  });
}

function restaurarHallazgos() {
  const lista = document.querySelector<HTMLElement>("[data-hallazgos]");
  lista?.querySelectorAll<HTMLElement>("[data-hallazgo]").forEach((item) => {
    item.dataset.estado = "corregido";
    const chip = item.querySelector<HTMLElement>("[data-chip]");
    if (chip) chip.textContent = lista.dataset.corregido ?? chip.textContent;
  });
  gsap.set("[data-linea-luz]", { clearProps: "transform" });
}

// ── Controles: demostraciones en bucle ─────────────────────────────────────

function controles() {
  document.querySelectorAll<HTMLElement>("[data-demo]").forEach((demo) => {
    const tipo = demo.dataset.demo;
    const tl =
      tipo === "webhook"
        ? demoWebhook(demo)
        : tipo === "boveda"
          ? demoBoveda(demo)
          : tipo === "admin"
            ? demoAdmin(demo)
            : tipo === "sql"
              ? demoSql(demo)
              : null;
    if (!tl) return;
    // Fuera de pantalla no se gasta ni un fotograma.
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting ? tl.play() : tl.pause()),
      { threshold: 0.35 },
    );
    io.observe(demo);
  });
}

const bucle = () =>
  gsap.timeline({ repeat: -1, repeatDelay: 0.6, paused: true });
const aparecer = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  duration: 0.45,
  ease: "power3.out",
};

function demoWebhook(demo: HTMLElement) {
  const ok = demo.querySelector<HTMLElement>('[data-fila="ok"]');
  const mal = demo.querySelector<HTMLElement>('[data-fila="mal"]');
  const nota = demo.querySelector<HTMLElement>("[data-nota]");
  if (!ok || !mal || !nota) return null;
  const pieza = (f: HTMLElement, sel: string) =>
    f.querySelector<HTMLElement>(sel)!;
  const montoOk = pieza(ok, "[data-monto]").textContent ?? "";
  const montoMal = pieza(mal, "[data-monto]");
  const alterado = montoMal.dataset.alterado ?? montoMal.textContent ?? "";
  const tl = bucle();
  for (const f of [ok, mal]) {
    tl.fromTo(
      pieza(f, "[data-sobre]"),
      { opacity: 0, x: -24 },
      aparecer,
      f === ok ? 0 : "+=0.6",
    );
    if (f === mal) {
      // El monto sale íntegro y cambia en tránsito: la firma se calculó
      // sobre el original, y por eso deja de coincidir.
      tl.set(montoMal, { textContent: montoOk }, "<")
        .to(
          montoMal,
          {
            duration: 0.7,
            scrambleText: { text: alterado, chars: "0123456789", speed: 0.5 },
          },
          "+=0.35",
        )
        .fromTo(nota, { opacity: 0, y: -4 }, aparecer, "<0.2");
    }
    tl.fromTo(
      pieza(f, "[data-flecha]"),
      { scaleX: 0, transformOrigin: "left center" },
      { scaleX: 1, duration: 0.35, ease: "power2.out" },
      "+=0.15",
    ).fromTo(
      pieza(f, "[data-veredicto]"),
      { opacity: 0, scale: 0.85 },
      { ...aparecer, ease: "back.out(2.2)" },
      "+=0.05",
    );
  }
  tl.to(
    pieza(mal, "[data-veredicto]"),
    { x: 4, duration: 0.06, repeat: 5, yoyo: true },
    "<0.2",
  )
    .to(
      demo.querySelectorAll("[data-fila], [data-nota]"),
      { opacity: 0, duration: 0.4 },
      "+=2.4",
    )
    .set(demo.querySelectorAll("[data-fila]"), { opacity: 1 });
  return tl;
}

function demoBoveda(demo: HTMLElement) {
  const claro = demo.querySelector<HTMLElement>("[data-claro]");
  const paso = demo.querySelector<HTMLElement>("[data-paso]");
  const cifra = demo.querySelector<HTMLElement>("[data-cifra]");
  if (!claro || !paso || !cifra) return null;
  const textoClaro = claro.textContent ?? "";
  const textoCifra = cifra.textContent ?? "";
  const tl = bucle();
  tl.set(cifra, { textContent: " ", opacity: 0.4 })
    .fromTo(claro, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    .to(
      claro,
      {
        duration: 0.9,
        scrambleText: {
          text: textoClaro,
          chars: "upperCase",
          revealDelay: 0.2,
          speed: 0.6,
        },
      },
      "<",
    )
    .fromTo(paso, { opacity: 0, y: -6 }, aparecer, "+=0.3")
    // El texto en claro se convierte en el cifrado mientras "baja" a la
    // base: el valor que llega ya no tiene nada legible.
    .set(cifra, { textContent: textoClaro, opacity: 1 })
    .to(cifra, {
      duration: 1.4,
      scrambleText: { text: textoCifra, chars: "0123456789abcdef", speed: 0.7 },
    })
    .to(claro, { opacity: 0.35, duration: 0.6 }, "<0.4")
    .to({}, { duration: 2.2 })
    .to([claro, paso, cifra], { opacity: 0, duration: 0.4 });
  return tl;
}

function demoAdmin(demo: HTMLElement) {
  const lineas = Array.from(demo.querySelectorAll<HTMLElement>("[data-linea]"));
  if (!lineas.length) return null;
  const tl = bucle();
  lineas.forEach((l, i) => {
    const marca = l.querySelector("b");
    const ultima = i === lineas.length - 1;
    tl.fromTo(
      l,
      { opacity: 0, y: 8 },
      aparecer,
      i === 0 ? 0 : ultima ? "+=0.5" : "+=0.25",
    );
    if (marca)
      tl.fromTo(
        marca,
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(3)" },
        "+=0.12",
      );
    if (ultima) tl.to(l, { x: 4, duration: 0.06, repeat: 5, yoyo: true });
  });
  tl.to(lineas, { opacity: 0, duration: 0.4 }, "+=2.2");
  return tl;
}

function demoSql(demo: HTMLElement) {
  const tecleo = demo.querySelector<HTMLElement>("[data-tecleo]");
  const cursor = demo.querySelector<HTMLElement>("[data-cursor]");
  const param = demo.querySelector<HTMLElement>("[data-param]");
  const resultado = demo.querySelector<HTMLElement>("[data-resultado]");
  const hueco = demo.querySelector<HTMLElement>(".cv-hueco");
  if (!tecleo || !cursor || !param || !resultado || !hueco) return null;
  const texto = tecleo.dataset.texto ?? tecleo.textContent ?? "";
  const estado = { n: 0 };
  const tl = bucle();
  tl.set(tecleo, { textContent: "" })
    .set(cursor, { opacity: 1 })
    .set(estado, { n: 0 })
    .to(estado, {
      n: texto.length,
      duration: texto.length * 0.09,
      ease: "none",
      onUpdate: () => {
        tecleo.textContent = texto.slice(0, Math.round(estado.n));
      },
    })
    .to(cursor, { opacity: 0, duration: 0.1 })
    // La entrada no se pega a la consulta: entra por el hueco como un valor.
    .fromTo(
      hueco,
      { color: "#00f2ff", textShadow: "0 0 0 rgba(0,242,255,0)" },
      {
        textShadow: "0 0 12px rgba(0,242,255,.9)",
        duration: 0.3,
        yoyo: true,
        repeat: 1,
      },
      "+=0.2",
    )
    .fromTo(param, { opacity: 0, y: -10 }, aparecer, "<0.1")
    .fromTo(resultado, { opacity: 0, x: -6 }, aparecer, "+=0.35")
    .to([param, resultado], { opacity: 0, duration: 0.4 }, "+=2.4")
    .to(tecleo, { opacity: 0, duration: 0.3 }, "<")
    .set(tecleo, { opacity: 1, textContent: "" });
  return tl;
}

// ── Metodología ────────────────────────────────────────────────────────────

function metodo() {
  const lista = document.querySelector<HTMLElement>("[data-metodo]");
  if (!lista) return;
  const luz = lista.querySelector("[data-metodo-luz]");
  const nums = lista.querySelectorAll(".me-num");
  const vertical = window.matchMedia("(max-width: 767px)").matches;
  gsap.set(luz, vertical ? { scaleY: 0 } : { scaleX: 0 });
  gsap.set(nums, { scale: 0.4, opacity: 0 });
  alEntrar(lista, "top 80%", () => {
    gsap.to(luz, {
      ...(vertical ? { scaleY: 1 } : { scaleX: 1 }),
      duration: 1.4,
      ease: "power2.inOut",
    });
    gsap.to(nums, {
      scale: 1,
      opacity: 1,
      duration: 0.6,
      ease: "back.out(2.5)",
      stagger: 0.42,
      clearProps: "transform,opacity",
    });
  });
}
