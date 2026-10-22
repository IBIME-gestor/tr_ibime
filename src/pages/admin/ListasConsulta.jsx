import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Search, Users, Route as RouteIcon, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RouteLists, Routes } from '../../firebase/services';

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const money = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
});

export default function ListasConsulta() {
  const navigate = useNavigate();
  const [lists, setLists] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([RouteLists.list(), Routes.list()])
      .then(([listRows, routeRows]) => {
        if (!active) return;
        setLists(listRows || []);
        setRoutes(routeRows || []);
      })
      .catch((e) => {
        console.error('Error consultando listas de alumnos:', e);
        if (active) setError(e?.message || 'No fue posible cargar las listas.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const routeNames = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r.name])), [routes]);
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es-MX');
    return lists.filter((list) => {
      const sameMonth = String(list.startDate || '').slice(0, 7) === month;
      const haystack = [
        list.listName, list.operatorName, routeNames[list.routeId], list.startDate, list.endDate,
      ].join(' ').toLocaleLowerCase('es-MX');
      return sameMonth && (!q || haystack.includes(q));
    }).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  }, [lists, month, search, routeNames]);

  const totalStudents = filtered.reduce((sum, item) => sum + (item.rows || []).length, 0);
  const totalAmount = filtered.reduce((sum, item) => sum + (item.rows || []).reduce((n, row) => n + Number(row.estimatedAmount || 0), 0), 0);
  const selected = filtered.find((item) => item.id === selectedId);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wider font-semibold text-navy-400">Operación / Listas alumnos</p>
        <h1 className="font-display text-2xl font-bold text-navy-900 mt-1">Consultar listas por mes</h1>
        <p className="text-sm text-navy-500 mt-1">Consulta las listas que ya fueron generadas, con sus fechas, ruta, operador y alumnos registrados.</p>
      </div>

      <section className="admin-card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="admin-label" htmlFor="month-lists">Mes de consulta</label>
            <input id="month-lists" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setSelectedId(''); }} className="admin-input w-full" />
          </div>
          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="search-lists">Buscar dentro del mes</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
              <input id="search-lists" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre de lista, ruta u operador…" className="admin-input w-full pl-9" />
            </div>
          </div>
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="admin-card flex items-center gap-3"><div className="rounded-lg bg-navy-50 p-2"><FileText size={19}/></div><div><p className="text-xs text-navy-400">Listas encontradas</p><p className="text-xl font-bold">{filtered.length}</p></div></div>
        <div className="admin-card flex items-center gap-3"><div className="rounded-lg bg-navy-50 p-2"><Users size={19}/></div><div><p className="text-xs text-navy-400">Registros de alumnos</p><p className="text-xl font-bold">{totalStudents}</p></div></div>
        <div className="admin-card flex items-center gap-3"><div className="rounded-lg bg-navy-50 p-2"><CalendarDays size={19}/></div><div><p className="text-xs text-navy-400">Monto estimado del mes</p><p className="text-xl font-bold">{money(totalAmount)}</p></div></div>
      </div>

      <section className="admin-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-100 flex justify-between items-center gap-2">
          <h2 className="font-semibold text-navy-800">Listas generadas en {month || '—'}</h2>
          <span className="text-xs text-navy-400">{filtered.length} resultado(s)</span>
        </div>
        {loading ? <p className="p-5 text-sm text-navy-500">Cargando listas…</p> : filtered.length === 0 ? (
          <div className="p-8 text-center"><FileText size={28} className="mx-auto text-navy-300 mb-2"/><p className="font-semibold text-navy-700">No hay listas para este mes</p><p className="text-sm text-navy-400 mt-1">Prueba con otro mes o genera una lista nueva.</p><button className="btn-admin-primary mt-4" onClick={() => navigate('/admin/listas-alumnos/generar')}>Generar lista</button></div>
        ) : (
          <div className="divide-y divide-navy-100">
            {filtered.map((item) => {
              const isOpen = selectedId === item.id;
              const rows = item.rows || [];
              const amount = rows.reduce((sum, row) => sum + Number(row.estimatedAmount || 0), 0);
              return <div key={item.id}>
                <button type="button" onClick={() => setSelectedId(isOpen ? '' : item.id)} className="w-full text-left px-4 py-3 hover:bg-navy-50 flex items-center gap-3">
                  <div className="hidden sm:flex rounded-lg bg-navy-50 p-2"><RouteIcon size={18}/></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-navy-800 truncate">{item.listName || routeNames[item.routeId] || 'Lista sin nombre'}</p>
                    <p className="text-xs text-navy-500 mt-1">{routeNames[item.routeId] || 'Ruta sin nombre'} · Operador: {item.operatorName || 'Sin asignar'}</p>
                    <p className="text-xs text-navy-400 mt-1">{item.startDate || '—'} al {item.endDate || '—'} · {rows.length} alumno(s) · {money(amount)}</p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-1 ${item.reviewed ? 'bg-green-100 text-green-800' : 'bg-amber-50 text-amber-800'}`}>{item.reviewed ? 'Revisada' : 'Pendiente de revisión'}</span>
                  {isOpen ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}
                </button>
                {isOpen && <div className="px-4 pb-4">
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                    <p className="text-xs text-navy-500">Estado: {item.status || 'Sin estado'} · {rows.length} alumno(s)</p>
                    <button type="button" className="btn-admin-ghost" onClick={() => navigate('/admin/listas-alumnos/modificar')}>Abrir módulo de modificación</button>
                  </div>
                  {rows.length ? <div className="overflow-x-auto"><table className="table-admin text-xs min-w-[620px]"><thead><tr><th>#</th><th>Alumno</th><th>Matrícula</th><th>Servicio</th><th>Días con servicio</th><th className="text-right">Monto estimado</th></tr></thead><tbody>
                    {rows.map((row, index) => <tr key={`${item.id}-${row.studentId || index}`}><td>{index + 1}</td><td>{row.name || '—'}</td><td>{row.matricula || '—'}</td><td>{row.tipoServicio === 'medio' ? `Medio (${row.medioServicio || 'entrada'})` : row.tipoServicio === 'diario' ? 'Diario' : 'Completo'}</td><td>{row.daysCount ?? Object.values(row.days || {}).filter((d) => d.entrada || d.salida).length}</td><td className="text-right">{money(row.estimatedAmount)}</td></tr>)}
                  </tbody></table></div> : <p className="text-sm text-navy-400">Esta lista no contiene alumnos.</p>}
                </div>}
              </div>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
