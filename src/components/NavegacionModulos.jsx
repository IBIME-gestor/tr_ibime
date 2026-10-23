import React from 'react'

/**
 * Navegación en dos niveles: arriba las categorías, abajo los módulos de
 * la categoría elegida. Reemplaza la fila única de pestañas, que con
 * ~16 módulos ya no cabía de forma legible.
 *
 *   categorias: salida de armarCategorias() (utils/modulos.js)
 *   activo:     id del módulo seleccionado
 *   onCambiar:  (idModulo) => void
 */
export default function NavegacionModulos({ categorias, activo, onCambiar, onChange }) {
  // Los paneles pasan 'onChange'; se acepta también 'onCambiar'.
  const cambiar = onCambiar || onChange

  const categoriaActiva =
    categorias.find((c) => c.modulos.some((m) => m.id === activo)) || categorias[0]

  if (!categoriaActiva) return null

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        {categorias.map((c) => {
          const seleccionada = c.id === categoriaActiva.id
          return (
            <button
              key={c.id}
              onClick={() => cambiar(c.modulos[0].id)}
              title={c.descripcion}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                seleccionada
                  ? 'bg-[#10395a] text-white border-[#10395a]'
                  : 'bg-white text-[#10395a] border-gray-200 hover:border-[#10395a]'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="mt-3 bg-white rounded-xl border border-gray-200 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs text-gray-400 hidden md:inline">{categoriaActiva.descripcion}</span>
        <div className="flex flex-wrap gap-1 md:ml-auto">
          {categoriaActiva.modulos.map((m) => (
            <button
              key={m.id}
              onClick={() => cambiar(m.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                activo === m.id
                  ? 'bg-[#e31e24] text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
