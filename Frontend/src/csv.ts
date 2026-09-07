/**
 * Generación y descarga de CSV.
 *
 * Tres detalles que deciden si el archivo sirve o no al abrirlo:
 *
 * 1. **BOM.** Sin él, Excel abre el archivo en la codificación del sistema y
 *    «Ludeña» se convierte en «LudeÃ±a». Tres bytes al principio lo evitan.
 * 2. **Punto y coma.** Excel con configuración regional en español espera `;`
 *    como separador de lista; con comas mete todas las columnas en una sola.
 *    Google Sheets detecta cualquiera de los dos.
 * 3. **Inyección de fórmulas.** Un campo que empieza por `=`, `+`, `-` o `@`
 *    lo ejecuta Excel como fórmula. Estos datos vienen de un formulario
 *    público: alguien puede llamarse `=1+1` o algo peor. Se antepone un
 *    apóstrofo, que Excel usa justamente para forzar texto y no se muestra.
 */

const SEPARADOR = ";"
const PELIGROSOS = ["=", "+", "-", "@", "\t", "\r"]

function celda(valor: string | number | null | undefined): string {
  if (valor == null) return '""'
  let s = String(valor)
  if (s && PELIGROSOS.includes(s[0])) s = `'${s}`
  // Las comillas internas se duplican; el campo entero va entrecomillado para
  // que un separador o un salto de línea dentro del texto no parta la fila.
  return `"${s.replace(/"/g, '""')}"`
}

export function buildCsv(cabeceras: string[], filas: (string | number | null)[][]): string {
  const lineas = [cabeceras.map(celda).join(SEPARADOR)]
  for (const fila of filas) lineas.push(fila.map(celda).join(SEPARADOR))
  // CRLF: es lo que espera el RFC 4180 y lo que Excel abre sin quejarse.
  return "\uFEFF" + lineas.join("\r\n") + "\r\n"
}

/** Convierte un título en algo que sirva de nombre de archivo. */
export function slug(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "evento"
  )
}

export function downloadCsv(nombre: string, contenido: string): void {
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Sin revocar, el blob se queda en memoria toda la sesión.
  URL.revokeObjectURL(url)
}
