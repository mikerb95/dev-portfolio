// Alfabeto del código corto de un cobro (/c/AB3K9F). Vive en su propio módulo
// porque lo comparten el generador (cobros-crypto.ts, solo servidor: usa
// node:crypto) y el validador (cobros.ts, que también corre en el navegador).
// Sin este archivo, uno de los dos tendría que duplicar la constante y podrían
// divergir: el generador emitiría códigos que el validador rechaza.

// Sin 0/O/1/I/L: el código se dicta por teléfono y se teclea a mano.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LEN = 6
