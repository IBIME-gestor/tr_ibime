import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Search, Upload, User, MapPin, Bus, CircleDollarSign, Pencil, Trash2, X,
  Phone, CreditCard, IdCard, School as SchoolIcon, Navigation,
} from 'lucide-react';
import { Students, Schools, Routes } from '../../firebase/services';
import { cascadeStyle } from '../../utils/cascade';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export const TIPOS_SERVICIO = {
  completo: 'Servicio completo (entrada y salida, todos los días)',
  medio: 'Servicio medio (solo entrada o solo salida, todos los días)',
  eventual_fijo: 'Eventual fijo (días de la semana, se repiten)',
  eventual_dia: 'Eventual día (fechas específicas, no se repiten)',
};

export const OPCIONES_SERVICIO = {
  entrada: 'Entrada',
  salida: 'Salida',
  ambas: 'Entrada + Salida',
};

const OPCIONES_SERVICIO_CORTO = { entrada: 'E', salida: 'S', ambas: 'E+S' };

const DIAS_SEMANA_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const BILLING_MODES = {
  mensual: 'Cuota mensual fija',
  por_dias: 'Tarifa fija según sus días de la semana',
  por_evento: 'Se cobra cada vez que se usa',
};

export const PAYMENT_STATUSES = {
  al_corriente: { label: 'Al corriente', badgeClass: 'badge-go' },
  desfase: { label: 'Con desfase', badgeClass: 'badge-amber' },
  sin_pago: { label: 'Sin pago', badgeClass: 'badge-stop' },
};

export const WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
];

const TABS = [
  { value: 'info', label: 'Información' },
  { value: 'servicio', label: 'Ruta y servicio' },
  { value: 'ubicacion', label: 'Ubicación' },
];

function SectionLabel({ icon: Icon, children }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">
      <Icon size={13} /> {children}
    </p>
  );
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {Icon && <Icon size={14} className="text-navy-300 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-navy-400">{label}</p>
        <p className="text-sm text-navy-800 font-medium break-words">{children}</p>
      </div>
    </div>
  );
}

function fmtDateTime(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  if (!ms) return null;
  return new Date(ms).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

const emptyForm = {
  matricula: '',
  name: '',
  schoolId: '',
  routeId: '',
  address: '',
  parentContact: '',
  tipoServicio: 'completo',
  medioServicio: 'entrada',
  diasFijos: [],
  fechasEventuales: [],
  billingMode: 'mensual',
  billingAmount: '',
  paymentStatus: 'al_corriente',
};

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routes, setRoutesState] = useState([]);
  const [form, setForm] = useState(emptyForm);

  // mode: 'view' (panel muestra al alumno seleccionado, solo lectura),
  // 'edit' (formulario sobre un alumno existente) o 'create' (alta nueva).
  const [mode, setMode] = useState('view');
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('info');

  const [filterSchool, setFilterSchool] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [search, setSearch] = useState('');

  const [newEventDate, setNewEventDate] = useState('');
  const [newEventServicio, setNewEventServicio] = useState('ambas');
  const [editingEventIndex, setEditingEventIndex] = useState(null);
  const [eventualError, setEventualError] = useState('');

  useEffect(() => Students.subscribe(setStudents), []);
  useEffect(() => Schools.subscribe(setSchools), []);
  useEffect(() => Routes.subscribe(setRoutesState), []);

  const selectedStudent = students.find((s) => s.id === selectedId) || null;

  function resetEventualInputs() {
    setNewEventDate('');
    setNewEventServicio('ambas');
    setEditingEventIndex(null);
    setEventualError('');
  }

  function handleSelectRow(student) {
    setSelectedId(student.id);
    setMode('view');
    setActiveTab('info');
    resetEventualInputs();
  }

  function handleNew() {
    setForm(emptyForm);
    setSelectedId(null);
    setMode('create');
    resetEventualInputs();
  }

  function handleEditClick() {
    if (!selectedStudent) return;
    setForm({ ...emptyForm, ...selectedStudent });
    setMode('edit');
    resetEventualInputs();
  }

  function handleCancelForm() {
    if (mode === 'create') {
      setSelectedId(null);
      setMode('view');
    } else {
      setMode('view');
    }
    setForm(emptyForm);
    resetEventualInputs();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.matricula.trim() || !form.name.trim() || !form.schoolId) return;
    if (mode === 'edit' && selectedId) {
      await Students.update(selectedId, form);
      setMode('view');
    } else {
      const newId = await Students.create(form);
      setSelectedId(newId);
      setMode('view');
    }
    setForm(emptyForm);
    setActiveTab('info');
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Dar de baja a este alumno? Esta acción no se puede deshacer.')) return;
    await Students.remove(id);
    if (selectedId === id) {
      setSelectedId(null);
      setMode('view');
    }
  }

  async function handlePaymentStatusChange(id, paymentStatus) {
    await Students.update(id, { paymentStatus });
  }

  function handleTipoServicioChange(tipoServicio) {
    const defaultBilling =
      tipoServicio === 'completo' || tipoServicio === 'medio' ? 'mensual'
      : tipoServicio === 'eventual_fijo' ? 'por_dias'
      : 'por_evento';
    setForm({ ...form, tipoServicio, billingMode: defaultBilling });
  }

  // --- Eventual fijo: cada día de la semana seleccionado trae su propio
  //     servicio (Entrada / Salida / Ambas), no uno global para todos. ---
  function toggleDiaFijo(dia) {
    const yaEsta = form.diasFijos.some((d) => d.dia === dia);
    const diasFijos = yaEsta
      ? form.diasFijos.filter((d) => d.dia !== dia)
      : [...form.diasFijos, { dia, servicio: 'ambas' }].sort((a, b) => a.dia - b.dia);
    setForm({ ...form, diasFijos });
  }

  function setDiaFijoServicio(dia, servicio) {
    setForm({
      ...form,
      diasFijos: form.diasFijos.map((d) => (d.dia === dia ? { ...d, servicio } : d)),
    });
  }

  // --- Eventual día: alta/edición/baja de fechas sueltas, cada una con
  //     su propio servicio. Nunca se copian solas a otras semanas. ---
  function handleAddOrEditFechaEventual() {
    setEventualError('');
    if (!newEventDate) {
      setEventualError('Selecciona una fecha.');
      return;
    }
    if (!newEventServicio) {
      setEventualError('Selecciona Entrada, Salida o Entrada + Salida.');
      return;
    }
    const duplicada = form.fechasEventuales.some(
      (f, i) => f.fecha === newEventDate && i !== editingEventIndex
    );
    if (duplicada) {
      setEventualError('Esa fecha ya está agregada para este alumno.');
      return;
    }

    const entry = { fecha: newEventDate, servicio: newEventServicio };
    let fechasEventuales;
    if (editingEventIndex != null) {
      fechasEventuales = form.fechasEventuales.map((f, i) => (i === editingEventIndex ? entry : f));
    } else {
      fechasEventuales = [...form.fechasEventuales, entry];
    }
    fechasEventuales.sort((a, b) => a.fecha.localeCompare(b.fecha));
    setForm({ ...form, fechasEventuales });
    setNewEventDate('');
    setNewEventServicio('ambas');
    setEditingEventIndex(null);
  }

  function handleEditFechaEventual(index) {
    const entry = form.fechasEventuales[index];
    setNewEventDate(entry.fecha);
    setNewEventServicio(entry.servicio);
    setEditingEventIndex(index);
    setEventualError('');
  }

  function handleRemoveFechaEventual(index) {
    setForm({ ...form, fechasEventuales: form.fechasEventuales.filter((_, i) => i !== index) });
    if (editingEventIndex === index) resetEventualInputs();
  }

  const filtered = students.filter((s) => {
    const matchSchool = !filterSchool || s.schoolId === filterSchool;
    const matchPayment = !filterPayment || (s.paymentStatus || 'al_corriente') === filterPayment;
    const matchSearch =
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.matricula?.includes(search);
    return matchSchool && matchPayment && matchSearch;
  });

  const paymentCounts = students.reduce(
    (acc, s) => {
      const status = s.paymentStatus || 'al_corriente';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { al_corriente: 0, desfase: 0, sin_pago: 0 }
  );

  const schoolName = (id) => schools.find((s) => s.id === id)?.name || '—';
  const routeName = (id) => routes.find((r) => r.id === id)?.name || null;

  function scheduleSummary(s) {
    const tipo = s.tipoServicio || 'completo';
    if (tipo === 'completo') return 'Completo · Entrada y salida · todos los días';
    if (tipo === 'medio') {
      const label = s.medioServicio === 'salida' ? 'Solo salida' : 'Solo entrada';
      return `Medio · ${label} · todos los días`;
    }
    if (tipo === 'eventual_fijo') {
      const dias = (s.diasFijos || [])
        .map((d) => `${WEEKDAYS.find((w) => w.value === d.dia)?.label}:${OPCIONES_SERVICIO_CORTO[d.servicio]}`)
        .join(' ');
      return `Eventual fijo · ${dias || 'sin días'}`;
    }
    if (tipo === 'eventual_dia') {
      return `Eventual día · ${(s.fechasEventuales || []).length} fecha(s)`;
    }
    return '—';
  }

  const showingForm = mode === 'edit' || mode === 'create';

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="admin-h1">Alumnos</h1>
          <p className="text-sm text-navy-400 mt-0.5">{students.length} alumnos dados de alta</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/alumnos/importar" className="btn-admin-ghost">
            <Upload size={15} /> Cargar CSV/Excel
          </Link>
          <Link to="/admin/alumnos/asignar-rutas" className="btn-admin-ghost">
            <Upload size={15} /> Asignar rutas en lote
          </Link>
          <button onClick={handleNew} className="btn-admin-primary">
            + Nuevo alumno
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterPayment('al_corriente')}
          className={`badge-go ${filterPayment === 'al_corriente' ? 'ring-2 ring-go' : ''}`}
        >
          {paymentCounts.al_corriente} al corriente
        </button>
        <button
          onClick={() => setFilterPayment('desfase')}
          className={`badge-amber ${filterPayment === 'desfase' ? 'ring-2 ring-signal-amber' : ''}`}
        >
          {paymentCounts.desfase} con desfase
        </button>
        <button
          onClick={() => setFilterPayment('sin_pago')}
          className={`badge-stop ${filterPayment === 'sin_pago' ? 'ring-2 ring-stop' : ''}`}
        >
          {paymentCounts.sin_pago} sin pago
        </button>
        {filterPayment && (
          <button onClick={() => setFilterPayment('')} className="link-action">
            Quitar filtro de pago
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        {/* -------------------------------------------------------------- */}
        {/* Columna izquierda: buscador, filtros y lista de alumnos         */}
        {/* -------------------------------------------------------------- */}
        <div>
          <div className="flex gap-3 mb-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o matrícula"
                className="admin-input pl-9"
              />
            </div>
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="admin-select w-auto"
            >
              <option value="">Todos los planteles</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="admin-card p-0 overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto overflow-x-auto">
              <table className="table-admin">
                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                  <tr>
                    <th className="pl-5">Matrícula</th>
                    <th>Nombre</th>
                    <th>Plantel</th>
                    <th>Ruta</th>
                    <th>Servicio</th>
                    <th className="pr-5">Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr
                      key={s.id}
                      onClick={() => handleSelectRow(s)}
                      className={`cascade-item cursor-pointer ${
                        selectedId === s.id ? 'bg-signal-yellow/10' : ''
                      }`}
                      style={cascadeStyle(i)}
                    >
                      <td className="pl-5 font-medium text-navy-700">{s.matricula}</td>
                      <td>{s.name}</td>
                      <td className="text-navy-500">{schoolName(s.schoolId)}</td>
                      <td>
                        {routeName(s.routeId) ? (
                          <span className="badge">{routeName(s.routeId)}</span>
                        ) : (
                          <span className="text-navy-400">Sin ruta</span>
                        )}
                      </td>
                      <td className="text-navy-500 text-xs">{scheduleSummary(s)}</td>
                      <td className="pr-5">
                        <select
                          value={s.paymentStatus || 'al_corriente'}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handlePaymentStatusChange(s.id, e.target.value)}
                          className={`text-xs rounded-md border-0 py-1 pr-6 font-medium cursor-pointer focus:ring-2 focus:ring-signal-yellow/40 ${PAYMENT_STATUSES[s.paymentStatus || 'al_corriente'].badgeClass}`}
                        >
                          {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-navy-400 text-sm py-6 text-center">No hay alumnos que coincidan.</p>
              )}
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Columna derecha: panel de detalle / formulario                  */}
        {/* -------------------------------------------------------------- */}
        <div className="lg:sticky lg:top-6">
          {showingForm ? (
            <form onSubmit={handleSubmit} className="admin-card shadow-panel transition-shadow">
              <p className="font-display font-semibold text-base text-navy-800 mb-4">
                {mode === 'edit' ? `Editar a ${form.name || 'alumno'}` : 'Nuevo alumno'}
              </p>
              <div className="space-y-4">
                <div>
                  <SectionLabel icon={User}>Datos del alumno</SectionLabel>
                  <div className="space-y-3">
                    <div>
                      <label className="admin-label">Matrícula</label>
                      <input
                        value={form.matricula}
                        onChange={(e) => setForm({ ...form, matricula: e.target.value })}
                        className="admin-input"
                        required
                      />
                    </div>
                    <div>
                      <label className="admin-label">Nombre completo</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="admin-input"
                        required
                      />
                    </div>
                    <div>
                      <label className="admin-label">Plantel</label>
                      <select
                        value={form.schoolId}
                        onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
                        className="admin-select"
                        required
                      >
                        <option value="">Selecciona…</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="admin-label">Ruta (opcional por ahora)</label>
                      <select
                        value={form.routeId}
                        onChange={(e) => setForm({ ...form, routeId: e.target.value })}
                        className="admin-select"
                      >
                        <option value="">Sin asignar</option>
                        {routes.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="border-t border-navy-100 pt-4">
                  <SectionLabel icon={MapPin}>Domicilio y contacto</SectionLabel>
                  <div className="space-y-3">
                    <div>
                      <label className="admin-label">Domicilio / punto de recolección</label>
                      <input
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        className="admin-input"
                      />
                    </div>
                    <div>
                      <label className="admin-label">Contacto del padre/madre (opcional)</label>
                      <input
                        value={form.parentContact}
                        onChange={(e) => setForm({ ...form, parentContact: e.target.value })}
                        placeholder="10 dígitos, para el botón de llamada del operador"
                        className="admin-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-navy-100 pt-4">
                  <SectionLabel icon={Bus}>Tipo de servicio</SectionLabel>
                  <div className="space-y-3">
                    <div>
                      <label className="admin-label">Tipo de servicio</label>
                      <select
                        value={form.tipoServicio}
                        onChange={(e) => handleTipoServicioChange(e.target.value)}
                        className="admin-select"
                      >
                        {Object.entries(TIPOS_SERVICIO).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>

                    {form.tipoServicio === 'medio' && (
                      <div className="cascade-item">
                        <label className="admin-label">¿Entrada o salida?</label>
                        <select
                          value={form.medioServicio}
                          onChange={(e) => setForm({ ...form, medioServicio: e.target.value })}
                          className="admin-select"
                        >
                          <option value="entrada">Solo entrada (recolección)</option>
                          <option value="salida">Solo salida (se lleva a casa)</option>
                        </select>
                      </div>
                    )}

                    {form.tipoServicio === 'eventual_fijo' && (
                      <div className="cascade-item">
                        <label className="admin-label">Días de la semana y su servicio</label>
                        <div className="space-y-2">
                          {WEEKDAYS.map((d) => {
                            const entry = form.diasFijos.find((x) => x.dia === d.value);
                            return (
                              <div key={d.value} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleDiaFijo(d.value)}
                                  className={
                                    entry
                                      ? 'badge cursor-pointer transition-transform active:scale-95 w-14 justify-center'
                                      : 'badge cursor-pointer opacity-40 transition-transform active:scale-95 w-14 justify-center'
                                  }
                                >
                                  {d.label}
                                </button>
                                {entry && (
                                  <select
                                    value={entry.servicio}
                                    onChange={(e) => setDiaFijoServicio(d.value, e.target.value)}
                                    className="admin-select flex-1 py-1.5 text-xs cascade-item"
                                  >
                                    {Object.entries(OPCIONES_SERVICIO).map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-xs text-navy-400 mt-2">
                          Se repite cada semana mientras el alumno siga contratado — no hace falta
                          volver a capturarlo.
                        </p>
                      </div>
                    )}

                    {form.tipoServicio === 'eventual_dia' && (
                      <div className="cascade-item space-y-2">
                        <label className="admin-label">Eventual día — fechas específicas</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="date"
                            value={newEventDate}
                            onChange={(e) => setNewEventDate(e.target.value)}
                            className="admin-input flex-1"
                          />
                          <select
                            value={newEventServicio}
                            onChange={(e) => setNewEventServicio(e.target.value)}
                            className="admin-select sm:w-40"
                          >
                            {Object.entries(OPCIONES_SERVICIO).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleAddOrEditFechaEventual}
                            className="btn-admin-ghost shrink-0"
                          >
                            {editingEventIndex != null ? 'Guardar cambios' : 'Agregar fecha'}
                          </button>
                        </div>
                        {editingEventIndex != null && (
                          <button
                            type="button"
                            onClick={resetEventualInputs}
                            className="text-xs text-navy-400 underline"
                          >
                            Cancelar edición
                          </button>
                        )}
                        {eventualError && <p className="text-stop text-xs">{eventualError}</p>}

                        {form.fechasEventuales.length > 0 ? (
                          <div className="border border-navy-100 rounded-lg overflow-hidden mt-1">
                            <table className="w-full text-xs">
                              <thead className="bg-navy-50 text-left text-navy-400">
                                <tr>
                                  <th className="p-2">Fecha</th>
                                  <th className="p-2">Día</th>
                                  <th className="p-2">Servicio</th>
                                  <th className="p-2"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-navy-50">
                                {form.fechasEventuales.map((f, i) => (
                                  <tr key={f.fecha} className="cascade-item" style={cascadeStyle(i, 30)}>
                                    <td className="p-2 whitespace-nowrap">{f.fecha}</td>
                                    <td className="p-2">
                                      {DIAS_SEMANA_LARGO[new Date(`${f.fecha}T00:00:00`).getDay()]}
                                    </td>
                                    <td className="p-2">{OPCIONES_SERVICIO[f.servicio]}</td>
                                    <td className="p-2 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => handleEditFechaEventual(i)}
                                        className="link-action mr-2"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFechaEventual(i)}
                                        className="link-danger"
                                      >
                                        Eliminar
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-navy-400">Aún no hay fechas agregadas.</p>
                        )}
                        <p className="text-xs text-navy-400">
                          Cada fecha es independiente — no se copia sola a las semanas siguientes.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-navy-100 pt-4">
                  <SectionLabel icon={CircleDollarSign}>Cobro y pago</SectionLabel>
                  <div className="space-y-3">
                    <div>
                      <label className="admin-label">Cobro (para caja)</label>
                      <select
                        value={form.billingMode}
                        onChange={(e) => setForm({ ...form, billingMode: e.target.value })}
                        className="admin-select"
                      >
                        {Object.entries(BILLING_MODES).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="admin-label">
                        {form.billingMode === 'por_evento' ? 'Monto por cada vez que se usa' : 'Monto'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.billingAmount}
                        onChange={(e) => setForm({ ...form, billingAmount: e.target.value })}
                        placeholder="$0.00"
                        className="admin-input"
                      />
                    </div>

                    <div>
                      <label className="admin-label">Estatus de pago</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={form.paymentStatus}
                          onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}
                          className="admin-select flex-1"
                        >
                          {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <span className={PAYMENT_STATUSES[form.paymentStatus].badgeClass}>●</span>
                      </div>
                      <p className="text-xs text-navy-400 mt-1">
                        Lo actualiza la administración a mano tras registrar el cobro; es solo para control interno.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button type="submit" className="btn-admin-primary flex-1">
                  {mode === 'edit' ? 'Guardar cambios' : 'Agregar alumno'}
                </button>
                <button type="button" onClick={handleCancelForm} className="btn-admin-ghost">
                  Cancelar
                </button>
              </div>
            </form>
          ) : selectedStudent ? (
            <div className="admin-card shadow-panel">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-navy-50 flex items-center justify-center shrink-0">
                    <User size={20} className="text-navy-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-navy-900 leading-snug break-words">
                      {selectedStudent.name}
                    </p>
                    <p className="text-xs text-navy-400">Matrícula: {selectedStudent.matricula}</p>
                    <span className={PAYMENT_STATUSES[selectedStudent.paymentStatus || 'al_corriente'].badgeClass}>
                      {PAYMENT_STATUSES[selectedStudent.paymentStatus || 'al_corriente'].label}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-navy-300 hover:text-navy-600 shrink-0"
                  title="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-4 border-b border-navy-100 mb-4">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setActiveTab(t.value)}
                    className={`pb-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                      activeTab === t.value
                        ? 'border-navy-800 text-navy-900'
                        : 'border-transparent text-navy-400 hover:text-navy-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {activeTab === 'info' && (
                <div className="divide-y divide-navy-50">
                  <DetailRow icon={User} label="Nombre completo">{selectedStudent.name}</DetailRow>
                  <DetailRow icon={IdCard} label="Matrícula">{selectedStudent.matricula}</DetailRow>
                  <DetailRow icon={SchoolIcon} label="Plantel">{schoolName(selectedStudent.schoolId)}</DetailRow>
                  <DetailRow icon={MapPin} label="Domicilio">
                    {selectedStudent.address || 'Sin domicilio registrado'}
                  </DetailRow>
                  <DetailRow icon={Phone} label="Contacto padre/madre">
                    {selectedStudent.parentContact || 'Sin registrar'}
                  </DetailRow>
                </div>
              )}

              {activeTab === 'servicio' && (
                <div className="divide-y divide-navy-50">
                  <DetailRow icon={Bus} label="Ruta">
                    {routeName(selectedStudent.routeId) || 'Sin ruta asignada'}
                  </DetailRow>
                  <DetailRow icon={Bus} label="Tipo de servicio">
                    {TIPOS_SERVICIO[selectedStudent.tipoServicio || 'completo']}
                  </DetailRow>
                  <DetailRow icon={Bus} label="Detalle del calendario">
                    {scheduleSummary(selectedStudent)}
                  </DetailRow>
                  <DetailRow icon={CreditCard} label="Cobro">
                    {BILLING_MODES[selectedStudent.billingMode || 'mensual']}
                  </DetailRow>
                  <DetailRow icon={CircleDollarSign} label="Monto">
                    {selectedStudent.billingAmount ? `$${selectedStudent.billingAmount}` : 'Sin monto registrado'}
                  </DetailRow>
                </div>
              )}

              {activeTab === 'ubicacion' && (
                <div>
                  {selectedStudent.lastDeliveredLocation?.lat ? (
                    <div className="space-y-2">
                      <div className="rounded-lg overflow-hidden border border-navy-100" style={{ height: 220 }}>
                        <MapContainer
                          center={[selectedStudent.lastDeliveredLocation.lat, selectedStudent.lastDeliveredLocation.lng]}
                          zoom={15}
                          style={{ height: '100%', width: '100%' }}
                          scrollWheelZoom={false}
                        >
                          <TileLayer
                            attribution="&copy; OpenStreetMap contributors"
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />
                          <Marker
                            position={[selectedStudent.lastDeliveredLocation.lat, selectedStudent.lastDeliveredLocation.lng]}
                          >
                            <Popup>{selectedStudent.name}</Popup>
                          </Marker>
                        </MapContainer>
                      </div>
                      <p className="text-xs text-navy-400">
                        Última entrega{fmtDateTime(selectedStudent.lastDeliveredAt) ? ` · ${fmtDateTime(selectedStudent.lastDeliveredAt)}` : ''}
                      </p>
                      <a
                        href={`https://www.google.com/maps?q=${selectedStudent.lastDeliveredLocation.lat},${selectedStudent.lastDeliveredLocation.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="link-action inline-flex items-center gap-1"
                      >
                        <Navigation size={12} /> Abrir en Google Maps
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-navy-400 py-4">
                      Este alumno todavía no ha sido entregado en ningún recorrido. En cuanto el
                      operador lo marque como entregado en su ruta, su última ubicación quedará
                      guardada y se mostrará aquí en un mapa.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-5 pt-4 border-t border-navy-100">
                <button onClick={handleEditClick} className="btn-admin-ghost flex-1">
                  <Pencil size={14} /> Editar alumno
                </button>
                <button
                  onClick={() => handleDelete(selectedStudent.id)}
                  className="btn-admin-ghost text-stop border-stop/30 hover:bg-stop-light"
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            </div>
          ) : (
            <div className="admin-card shadow-panel text-center py-10">
              <User size={28} className="mx-auto text-navy-200 mb-2" />
              <p className="text-sm text-navy-400">
                Selecciona un alumno de la lista para ver su información,
                <br />o da clic en "Nuevo alumno" para dar de alta a uno.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
