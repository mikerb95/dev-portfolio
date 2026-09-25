import { describe, expect, it } from "vitest";
import {
  CAPAS_X,
  FRACCION_HOSTIL,
  SITIO_X,
  alcance,
  crearAzar,
  crearOnda,
  destinoDe,
  elegirPonderado,
  escenaEstatica,
  golpear,
  nuevoTipo,
  pasoOnda,
  repartoHostil,
  resumenCapas,
  tramosBitacora,
} from "../src/lib/motion/filtro";

// Lógica pura detrás del hero de /security: qué parte de la escena es dato
// (el reparto entre categorías) y qué parte es ilustración (la proporción de
// tráfico limpio), qué hace el sistema con cada tipo de petición y cómo se
// mueven las membranas.

const filas = [
  { category: "recon_cms", count: 600 },
  { category: "secrets_probing", count: "300" },
  { category: "blocklist", count: 50 },
  { category: "api_abuse", count: 30 },
  { category: "honeypot", count: 20 },
];

describe("destino de cada categoría", () => {
  it("la lista de bloqueo y el límite de tasa frenan en el clasificador", () => {
    expect(destinoDe("blocklist")).toBe("frenada");
    expect(destinoDe("api_abuse")).toBe("frenada");
  });
  it("el señuelo atrapa y el resto se registra", () => {
    expect(destinoDe("honeypot")).toBe("senuelo");
    expect(destinoDe("injection")).toBe("registrada");
    expect(destinoDe("categoria_nueva")).toBe("registrada");
  });
  it("ningún punto hostil llega al sitio, y el limpio sí", () => {
    expect(alcance("limpia")).toBe(SITIO_X);
    for (const d of ["frenada", "senuelo", "registrada"] as const)
      expect(alcance(d)).toBeLessThan(SITIO_X);
    expect(alcance("frenada")).toBe(CAPAS_X[1]);
    expect(alcance("senuelo")).toBe(CAPAS_X[2]);
  });
});

describe("reparto real", () => {
  it("normaliza a pesos que suman 1, ordenados de mayor a menor, aceptando conteos en texto", () => {
    const r = repartoHostil(filas);
    expect(r.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1, 10);
    expect(r[0]).toMatchObject({
      categoria: "recon_cms",
      destino: "registrada",
    });
    expect(r[1].peso).toBeCloseTo(300 / 1000);
    for (let i = 1; i < r.length; i++)
      expect(r[i].peso).toBeLessThanOrEqual(r[i - 1].peso);
  });
  it("sin actividad hostil no hay reparto (y entonces todo punto es limpio)", () => {
    expect(repartoHostil([])).toEqual([]);
    expect(
      repartoHostil([
        { category: "x", count: 0 },
        { category: "y", count: "nan" },
      ]),
    ).toEqual([]);
    const azar = crearAzar(1);
    for (let i = 0; i < 50; i++)
      expect(nuevoTipo([], azar).destino).toBe("limpia");
  });
  it("el resumen de capas suma frenadas y señuelos desde los mismos agregados", () => {
    expect(resumenCapas(filas, 1000, 17)).toEqual({
      detectados: 1000,
      frenadas: 80,
      senuelos: 20,
      bloqueos: 17,
    });
  });
  it("a largo plazo, la mezcla de puntos respeta la fracción ilustrativa y el reparto real", () => {
    const reparto = repartoHostil(filas);
    const azar = crearAzar(42);
    const cuenta: Record<string, number> = {};
    const N = 40_000;
    for (let i = 0; i < N; i++) {
      const t = nuevoTipo(reparto, azar);
      const k = t.categoria ?? "limpia";
      cuenta[k] = (cuenta[k] ?? 0) + 1;
    }
    const hostiles = N - cuenta.limpia;
    expect(hostiles / N).toBeCloseTo(FRACCION_HOSTIL, 1);
    expect(cuenta.recon_cms / hostiles).toBeCloseTo(0.6, 1);
    expect(cuenta.honeypot / hostiles).toBeCloseTo(0.02, 1);
  });
});

describe("azar con semilla", () => {
  it("la misma semilla da la misma secuencia, en [0, 1)", () => {
    const a = crearAzar(7);
    const b = crearAzar(7);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("elegirPonderado respeta los extremos y descarta pesos no positivos", () => {
    const items = [
      { id: "a", peso: 0 },
      { id: "b", peso: 1 },
      { id: "c", peso: 3 },
    ];
    expect(elegirPonderado(items, 0)?.id).toBe("b");
    expect(elegirPonderado(items, 0.2499)?.id).toBe("b");
    expect(elegirPonderado(items, 0.25)?.id).toBe("c");
    expect(elegirPonderado(items, 0.9999)?.id).toBe("c");
    expect(elegirPonderado([{ peso: 0 }], 0.5)).toBeNull();
  });
});

describe("membranas", () => {
  it("un golpe se propaga y la membrana vuelve al reposo con los extremos fijos", () => {
    const onda = crearOnda(40);
    golpear(onda, 0.5, 60);
    let max = 0;
    for (let i = 0; i < 10; i++) max = Math.max(max, pasoOnda(onda, 1 / 60));
    expect(max).toBeGreaterThan(0.5);
    // El golpe no se queda en su nodo: llega a los vecinos lejanos.
    expect(Math.abs(onda.y[10]) + Math.abs(onda.y[30])).toBeGreaterThan(0);
    for (let i = 0; i < 600; i++) pasoOnda(onda, 1 / 60);
    expect(pasoOnda(onda, 1 / 60)).toBeLessThan(0.01);
    expect(onda.y[0]).toBe(0);
    expect(onda.y[40]).toBe(0);
  });
  it("un fotograma larguísimo no hace explotar la integración", () => {
    const onda = crearOnda(40);
    golpear(onda, 0.3, 80);
    const max = pasoOnda(onda, 5);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeLessThan(50);
  });
});

describe("escena estática del servidor", () => {
  const reparto = repartoHostil(filas);
  const escena = escenaEstatica(reparto, 11, 400);

  it("es determinista", () => {
    expect(escenaEstatica(reparto, 11, 400)).toEqual(escena);
  });
  it("cada punto está en un tramo que su destino recorre de verdad", () => {
    for (const p of escena) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(0.9);
      if (p.destino === "frenada") expect(p.x).toBeLessThan(CAPAS_X[1]);
      if (p.destino === "senuelo") expect(p.x).toBeLessThan(CAPAS_X[2]);
      if (p.destino === "registrada")
        expect(p.x).toBeLessThan(CAPAS_X[1] + 0.11);
      if (p.destino === "limpia") expect(p.x).toBeLessThan(SITIO_X);
    }
  });
});

describe("bitácora", () => {
  it("los tramos cubren exactamente el reparto y agrupan la cola fina", () => {
    const reparto = repartoHostil([
      ...filas,
      { category: "protocol_anomaly", count: 1 },
    ]);
    const tramos = tramosBitacora(reparto);
    const fin = tramos[tramos.length - 1];
    expect(fin.desde + fin.ancho).toBeCloseTo(1, 10);
    expect(tramos.at(-1)?.categoria).toBe("otros");
    // El señuelo es fino (2 %) pero tiene color propio: no se esconde en "otros".
    expect(tramos.some((t) => t.categoria === "honeypot")).toBe(true);
    for (let i = 1; i < tramos.length; i++)
      expect(tramos[i].desde).toBeCloseTo(
        tramos[i - 1].desde + tramos[i - 1].ancho,
        10,
      );
  });
});
