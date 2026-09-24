// JSON para incrustar dentro de un <script> (application/json o ld+json).
//
// JSON.stringify no escapa `<`: un `</script>` dentro de cualquier valor (el
// título de un proyecto, una nota, el nombre de un gasto) cierra la etiqueta y
// lo que sigue se interpreta como HTML. En cuanto ese valor sale de la base,
// es XSS almacenado. Los caracteres peligrosos se escriben como escapes
// \uXXXX, que JSON.parse (y cualquier lector de JSON-LD) devuelve idénticos.
//
// Módulo puro: lo usan páginas y layouts en el servidor.

export function jsonEnScript(valor: unknown): string {
  return (JSON.stringify(valor) ?? 'null')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/ /g, '\\u2028')
    .replace(/ /g, '\\u2029')
}
