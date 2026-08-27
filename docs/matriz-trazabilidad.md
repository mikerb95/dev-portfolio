# Matriz de trazabilidad: Historias de Usuario ↔ Casos de Prueba

Generada el 27 de agosto de 2026, cruzando
[`historias-de-usuario.md`](historias-de-usuario.md) (HU-01..HU-41) contra los
10 casos de prueba de caja negra de
[`taller-testing-caja-negra.md`](taller-testing-caja-negra.md) (TC-01..TC-10).

**Alcance real, no inflado:** el taller de caja negra cubrió dos módulos -
Portal de clientes (autenticación, facturas, cuenta) y Cobros de campo
(`/cobrar → /c/[code] → /mis-pagos`) - de los cinco grandes bloques del
catálogo de historias (visitantes del sitio público, administrador del panel,
observabilidad/seguridad, portal de clientes, cobros de campo, demo y
captación). Que una historia no aparezca aquí como cubierta **no** significa
que carezca de toda prueba en el proyecto: puede estar cubierta por Vitest
(`tests/*.test.ts`) o por otros specs de Playwright (`e2e/*.spec.ts`) fuera del
alcance de este taller. Lo que esta matriz certifica con precisión es
**trazabilidad de caja negra manual con evidencia fotográfica**, que es lo que
pide el ítem 7 de la rúbrica.

El mapeo se hizo leyendo el criterio de aceptación completo de cada HU
candidata y comparándolo contra el objetivo y los pasos exactos de cada TC.
Donde ningún criterio de aceptación describía lo que el caso prueba, se dejó
sin asignar en vez de forzar la relación más parecida - ver la sección de
casos sin historia, más abajo.

## HU → TC → veredicto → evidencia

| Historia de usuario | Casos que la cubren | Veredicto | Evidencia |
|---|---|---|---|
| [HU-35 - Ver mis facturas y descargarlas](historias-de-usuario.md#hu-35---ver-mis-facturas-y-descargarlas) | TC-01, TC-02, TC-04, TC-05, TC-06 | **PASA** (5/5) | `evidencias-taller-testing/TC-01-login-valido-dashboard.jpg`, `TC-02-login-credenciales-invalidas.jpg`, `TC-04-facturas-listado.jpg`, `TC-05-factura-detalle-pdf.jpg`, `TC-06-aislamiento-entre-clientes-404.jpg` |
| [HU-37 - Recuperar el acceso a mi cuenta](historias-de-usuario.md#hu-37---recuperar-el-acceso-a-mi-cuenta) | TC-03, TC-08 | **PASA** (2/2; TC-08 pasó a conforme el 27 ago 2026, era BUG-01) | `TC-03-bloqueo-tras-10-intentos.jpg`, `TC-08-menu-cerrar-sesion.jpg` + `BUG-01-logout-csrf.jpg` (corrida original) + `e2e/portal.spec.ts` (reverificación automatizada) |
| [HU-38 - Cobrar un trabajo desde el celular por WhatsApp](historias-de-usuario.md#hu-38---cobrar-un-trabajo-desde-el-celular-por-whatsapp) | TC-09 | **PASA** (1/1) | `TC-09a-cobro-link-vigente.jpg`, `TC-09b-pago-recibido.jpg`, `TC-09c-cobro-link-vencido.jpg` |
| [HU-39 - Consultar mi histórico de pagos como cliente](historias-de-usuario.md#hu-39---consultar-mi-histórico-de-pagos-como-cliente) | TC-10 | **PASA con observación** (BUG-03: entradas inválidas consumen cuota) | `TC-10-mis-pagos-historico-enmascarado.jpg` |

**Nota sobre HU-38:** la historia está narrada desde el administrador que
arma y envía el link; TC-09 prueba lo que ocurre desde el momento en que el
cliente abre ese link (segunda mitad del criterio de aceptación: "el cliente
recibe un enlace corto que lleva al checkout"). La primera mitad de HU-38 -
configurar el monto y enviarlo por WhatsApp desde el panel de admin - no tiene
caso de caja negra en este taller; queda como historia parcialmente cubierta.

## Casos de prueba sin historia de usuario que los cubra

| Caso | Por qué no calza | Qué se hizo en vez de forzarlo |
|---|---|---|
| **TC-07** - Cambio de contraseña estando autenticado | HU-37 ("Recuperar el acceso a mi cuenta") es la más cercana por módulo, pero su narrativa completa es "cliente que **olvidó** su contraseña" y sus criterios de aceptación describen invitación, olvido y restablecimiento por correo - nunca un cambio voluntario desde una sesión ya activa. Son dos historias de usuario distintas aunque compartan la palabra "contraseña". | Se dejó `null` en la ficha de TC-07 (`docs/taller-testing-caja-negra.md`) con la explicación completa. No se inventó una HU-42 para tapar el hueco. |

## Historias de usuario sin cobertura de prueba de caja negra en este taller

37 de las 41 historias del catálogo no tienen un TC de este taller que las
ejercite. Se listan agrupadas por bloque, tal como aparecen en
`historias-de-usuario.md`, para que el jurado pueda ver de un vistazo dónde
está el foco real de la evidencia manual (autenticación y dinero del portal +
cobros de campo) y dónde no.

### Visitantes del sitio público (5)
HU-01, HU-02, HU-03, HU-04, HU-05

### Administrador (Mike) - Panel de control (18)
HU-06, HU-07, HU-08, HU-09, HU-10, HU-11, HU-12, HU-13, HU-14, HU-15, HU-16,
HU-17, HU-18, HU-19, HU-20, HU-21, HU-22, HU-23

### Administrador (Mike) - Presentaciones y vitrina (3)
HU-24, HU-25, HU-26, HU-27 *(nota: son 4, la numeración del catálogo original
agrupa presentación y vitrina en el mismo bloque narrativo)*

### Observabilidad de seguridad (3)
HU-28, HU-29, HU-30

### Portal de clientes - fuera del alcance de este taller (4)
HU-31, HU-32, HU-33, HU-34, HU-36
*(HU-36 - "Seguir el avance de mi proyecto y hablar con el desarrollador" - es
del mismo bloque que las 4 historias sí cubiertas, pero ningún TC de este
taller ejercita hitos, documentos ni mensajería; solo facturas y cuenta.)*

### Demo y captación (2)
HU-40, HU-41

**Lectura honesta para el jurado:** este taller de caja negra fue deliberado
y angosto - autenticación y dinero (portal + cobros), que son los caminos
donde un fallo cuesta más caro (acceso indebido, doble cobro, fuga entre
clientes). No es una auditoría de cobertura del catálogo de 41 historias
completo. Extender la caja negra manual a los otros bloques (paneles de
seguridad, presentaciones, aprendizaje) es trabajo pendiente, no un hallazgo
de que esas historias fallen o estén sin probar de ninguna forma - varias
tienen lógica cubierta por `tests/*.test.ts` (por ejemplo HU-28/29/30 vía
`tests/security-*.test.ts`, HU-40 vía `e2e/demo.spec.ts`), que es un nivel de
prueba distinto y no reemplaza la trazabilidad manual que pide este documento.

## Fuentes

- `docs/historias-de-usuario.md` - catálogo HU-01..HU-41, actualizado 24 jul 2026.
- `docs/taller-testing-caja-negra.md` - fichas TC-01..TC-10 con el campo
  "Historia de usuario" añadido el 27 ago 2026.
- `presentation-spec.json` → `tests.matrix[]` - misma asignación, en formato
  máquina para la presentación de sustentación.
