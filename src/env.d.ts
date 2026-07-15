declare namespace App {
  interface Locals {
    /**
     * El request entró con un pase de demo (sin sesión real): datos ficticios y
     * solo lectura. Lo fija el middleware; las páginas de /admin lo usan para
     * mostrar el aviso y ocultar acciones. Ver src/lib/demo.ts.
     */
    demo?: boolean
  }
}
