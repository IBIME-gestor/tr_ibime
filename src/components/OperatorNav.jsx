import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Menú del operador en formato "píldora": solo íconos para ahorrar espacio.
 * El módulo activo se expande con animación y muestra su nombre; los demás
 * quedan como círculos. Si no caben, se desplaza horizontalmente (con
 * flechas) y el módulo activo se centra solo.
 *
 * items: [{ to, label, icon: LucideIcon, end?: boolean, badge?: number }]
 */
export default function OperatorNav({ items }) {
  const scrollerRef = useRef(null);
  const { pathname } = useLocation();
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // Centra el módulo activo cuando termina de expandirse
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      const active = el.querySelector('[aria-current="page"]');
      if (active) {
        const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
        el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      }
      updateArrows();
    }, 320);
    return () => clearTimeout(t);
  }, [pathname, updateArrows]);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateArrows]);

  const scrollBy = (dir) =>
    scrollerRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });

  const arrowClass =
    'absolute top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-panel transition-opacity duration-200 motion-reduce:transition-none';

  return (
    <div className="relative mx-4 mb-3 rounded-full bg-navy-50 px-1.5 py-3">
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Ver módulos anteriores"
        tabIndex={canLeft ? 0 : -1}
        className={`${arrowClass} left-1 bg-navy-800/90 ${canLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <ChevronLeft size={14} />
      </button>

      <nav
        ref={scrollerRef}
        onScroll={updateArrows}
        aria-label="Módulos del operador"
        className="flex items-center gap-2 overflow-x-auto px-1 py-1.5 -my-1.5 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            aria-label={label}
            className={({ isActive }) =>
              `relative shrink-0 flex items-center h-11 rounded-full select-none outline-none
               focus-visible:ring-2 focus-visible:ring-signal-yellow
               transition-[background-color,color,padding] duration-300 ease-out motion-reduce:transition-none ${
                 isActive
                   ? 'bg-navy-800 text-white pl-3 pr-4'
                   : 'bg-navy-100/70 text-navy-800 hover:bg-navy-100 px-[11px]'
               }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  strokeWidth={1.9}
                  className={`shrink-0 transition-colors duration-300 ${isActive ? 'text-signal-yellow' : ''}`}
                />

                {/* Truco grid 0fr→1fr: anima el ancho real del texto sin medirlo */}
                <span
                  className={`grid transition-[grid-template-columns,margin,opacity] duration-300 ease-out motion-reduce:transition-none ${
                    isActive ? 'grid-cols-[1fr] ml-2 opacity-100' : 'grid-cols-[0fr] ml-0 opacity-0'
                  }`}
                >
                  <span className="overflow-hidden whitespace-nowrap text-sm font-display font-semibold">
                    {label}
                  </span>
                </span>

                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-navy-50">
                    {badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Ver más módulos"
        tabIndex={canRight ? 0 : -1}
        className={`${arrowClass} right-1 bg-navy-800/90 ${canRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
