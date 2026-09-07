/**
 * CSV pensado para que Excel en español lo abra bien: BOM (si no, «Ludeña» sale
 * «LudeÃ±a»), `;` como separador (con comas mete todo en una columna) y el
 * apóstrofo antifórmulas de `celda()`.
 */

const SEPARADOR = ";"
const PELIGROSOS = ["=", "+", "-", "@", "\t", "\r"]

function celda(valor: string | number | null | undefined): string {
  if (valor == null) return '""'
  let s = String(valor)
  // Los nombres vienen de un formulario público: Excel ejecutaría `=1+1` como
  // fórmula. El apóstrofo lo fuerza a texto y no se ve en la celda.
  if (s && PELIGROSOS.includes(s[0])) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function buildCsv(cabeceras: string[], filas: (string | number | null)[][]): string {
  const lineas = [cabeceras.map(celda).join(SEPARADOR)]
  for (const fila of filas) lineas.push(fila.map(celda).join(SEPARADOR))
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
  URL.revokeObjectURL(url)
}
