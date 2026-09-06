import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Upload, X } from 'lucide-react';
import { Students, Schools, Routes } from '../../firebase/services';

export const SERVICE_TYPES = {
  ida: 'Solo ida (recolección)',
  salida: 'Solo salida (entrega)',
  ambos: 'Ida y salida',
};

export const SCHEDULE_TYPES = {
  mensual: 'Mes completo',
  dias_fijos: 'Días fijos a la semana',
  eventual: 'Eventual (fechas sueltas)',
};

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

const emptyForm = {
  matricula: '',
  name: '',
  schoolId: '',
  routeId: '',
  address: '',
  parentContact: '',
  serviceType: 'ambos',
  scheduleType: 'mensual',
  activeDays: [],
  eventDates: [],
  billingMode: 'mensual',
  billingAmount: '',
  paymentStatus: 'al_corriente',
};

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routes, setRoutesState] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filterSchool, setFilterSchool] = useState('');
  const [search, setSearch] = useState('');
  const [newEventDate, setNewEventDate] = useState('');

  useEffect(() => Students.subscribe(setStudents), []);
  useEffect(() => Schools.subscribe(setSchools), []);
  useEffect(() => Routes.subscribe(setRoutesState), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.matricula.trim() || !form.name.trim() || !form.schoolId) return;
    if (editingId) {
      await Students.update(editingId, form);
    } else {
      await Students.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleEdit(student) {
    setForm({ ...emptyForm, ...student });
    setEditingId(student.id);
  }

  function handleCancel() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleScheduleTypeChange(scheduleType) {
    const defaultBilling =
      scheduleType === 'mensual' ? 'mensual'
      : scheduleType === 'dias_fijos' ? 'por_dias'
      : 'por_evento';
    setForm({ ...form, scheduleType, billingMode: defaultBilling });
  }

  function toggleDay(day) {
    const activeDays = form.activeDays.includes(day)
      ? form.activeDays.filter((d) => d !== day)
      : [...form.activeDays, day].sort();
    setForm({ ...form, activeDays });
  }

  function addEventDate() {
    if (!newEventDate || form.eventDates.includes(newEventDate)) return;
    setForm({ ...form, eventDates: [...form.eventDates, newEventDate].sort() });
    setNewEventDate('');
  }

  function removeEventDate(date) {
    setForm({ ...form, eventDates: form.eventDates.filter((d) => d !== date) });
  }

  async function handleDelete(id) {
    if (window.confirm('¿Dar de baja a este alumno?')) {
      await Students.remove(id);
    }
  }

  async function handlePaymentStatusChange(id, paymentStatus) {
    await Students.update(id, { paymentStatus });
  }

  const [filterPayment, setFilterPayment] = useState('');

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
    const service = SERVICE_TYPES[s.serviceType] || SERVICE_TYPES.ambos;
    if (s.scheduleType === 'dias_fijos') {
      const days = (s.activeDays || [])
        .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
        .filter(Boolean)
        .join('/');
      return `${service} · ${days || 'sin días'}`;
    }
    if (s.scheduleType === 'eventual') {
      return `${service} · Eventual (${(s.eventDates || []).length} fechas)`;
    }
    return `${service} · Mes completo`;
  }

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

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        <form onSubmit={handleSubmit} className="admin-card lg:sticky lg:top-6">
          <p className="font-display font-semibold text-sm text-navy-800 mb-3">
            {editingId ? 'Editar alumno' : 'Nuevo alumno'}
          </p>
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
                placeholder="10 dígitos, para el botón de llamada del chofer"
                className="admin-input"
              />
            </div>

            <div className="border-t border-navy-100 pt-3">
              <label className="admin-label">Servicio de transporte</label>
              <select
                value={form.serviceType}
                onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                className="admin-select"
              >
                {Object.entries(SERVICE_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label">Calendario</label>
              <select
                value={form.scheduleType}
                onChange={(e) => handleScheduleTypeChange(e.target.value)}
                className="admin-select"
              >
                {Object.entries(SCHEDULE_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {form.scheduleType === 'dias_fijos' && (
              <div>
                <label className="admin-label">Días que toma el servicio</label>
                <div className="flex gap-1.5 flex-wrap">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={
                        form.activeDays.includes(d.value)
                          ? 'badge cursor-pointer'
                          : 'badge cursor-pointer opacity-40'
                      }
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.scheduleType === 'eventual' && (
              <div>
                <label className="admin-label">Fechas en que toma el servicio</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="admin-input flex-1"
                  />
                  <button type="button" onClick={addEventDate} className="btn-admin-ghost">
                    Agregar
                  </button>
                </div>
                {form.eventDates.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {form.eventDates.map((date) => (
                      <span key={date} className="badge inline-flex items-center gap-1">
                        {date}
                        <X size={12} className="cursor-pointer" onClick={() => removeEventDate(date)} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-navy-100 pt-3">
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
              <select
                value={form.paymentStatus}
                onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}
                className="admin-select"
              >
                {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-navy-400 mt-1">
                Lo actualiza la administración a mano tras registrar el cobro; es solo para control interno.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn-admin-primary flex-1">
              {editingId ? 'Guardar cambios' : 'Agregar alumno'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-admin-ghost">
                Cancelar
              </button>
            )}
          </div>
        </form>

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

          <div className="admin-card p-0 overflow-x-auto">
            <table className="table-admin">
              <thead>
                <tr>
                  <th className="pl-5">Matrícula</th>
                  <th>Nombre</th>
                  <th>Plantel</th>
                  <th>Ruta</th>
                  <th>Servicio</th>
                  <th>Pago</th>
                  <th className="pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
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
                    <td>
                      <select
                        value={s.paymentStatus || 'al_corriente'}
                        onChange={(e) => handlePaymentStatusChange(s.id, e.target.value)}
                        className={`text-xs rounded-md border-0 py-1 pr-6 font-medium cursor-pointer focus:ring-2 focus:ring-signal-yellow/40 ${PAYMENT_STATUSES[s.paymentStatus || 'al_corriente'].badgeClass}`}
                      >
                        {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-5 text-right whitespace-nowrap">
                      <button onClick={() => handleEdit(s)} className="link-action mr-3">Editar</button>
                      <button onClick={() => handleDelete(s.id)} className="link-danger">Eliminar</button>
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
    </div>
  );
}
