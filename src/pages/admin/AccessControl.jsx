import { useEffect, Fragment, useState } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Users, Drivers } from '../../firebase/services';
import { UserCheck, ShieldCheck, Ban, RotateCcw, Truck, Baby, Wallet } from 'lucide-react';
import { fmtTimestamp24 } from '../../utils/dates';
import { cascadeStyle } from '../../utils/cascade';

const ROLE_META = {
  admin: { label: 'Administrador', badgeClass: 'badge-go' },
  driver: { label: 'Operador', badgeClass: 'badge' },
  nanny: { label: 'Nanny', badgeClass: 'badge' },
  cashier: { label: 'Cajero(a)', badgeClass: 'badge-amber' },
  sin_rol: { label: 'Sin rol asignado', badgeClass: 'badge-stop' },
};

const STAFF_ROLE_OPTIONS = [
  { role: 'driver', label: 'Operador', icon: Truck },
  { role: 'nanny', label: 'Nanny', icon: Baby },
  { role: 'cashier', label: 'Cajero(a)', icon: Wallet },
];

/**
 * "Personas con acceso": cualquiera que entre con su cuenta @ibime.edu.mx
 * aparece aquí automáticamente (ver AuthContext.provisionProfile), con
 * "Sin rol asignado" si nadie lo tenía pre-registrado. Desde aquí el
 * admin le da su rol real — o lo suspende sin borrar su historial.
 */
export default function AccessControl() {
  const [users, setUsers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [assigningFor, setAssigningFor] = useState(null); // uid
  const [pickedRole, setPickedRole] = useState(null);
  const [linkMode, setLinkMode] = useState('new'); // 'new' | 'existing'
  const [existingStaffId, setExistingStaffId] = useState('');

  useEffect(() => Users.subscribe(setUsers), []);
  useEffect(() => Drivers.subscribe(setDrivers), []);

  const sorted = [...users].sort((a, b) => {
    if (a.role === 'sin_rol' && b.role !== 'sin_rol') return -1;
    if (b.role === 'sin_rol' && a.role !== 'sin_rol') return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  async function toggleAdmin(u, makeAdmin) {
    await Users.update(u.id, { role: makeAdmin ? 'admin' : 'sin_rol', staffId: null });
    if (makeAdmin) {
      await setDoc(doc(db, 'admins', u.email), { name: u.name, addedAt: new Date().toISOString() });
    } else {
      await deleteDoc(doc(db, 'admins', u.email));
    }
  }

  async function toggleActive(u, activo) {
    await Users.update(u.id, { activo });
  }

  function startAssign(u, role) {
    setAssigningFor(u.id);
    setPickedRole(role);
    setLinkMode('new');
    setExistingStaffId('');
  }

  function cancelAssign() {
    setAssigningFor(null);
    setPickedRole(null);
  }

  async function confirmAssign(u) {
    let staffId = existingStaffId;
    if (linkMode === 'new') {
      staffId = await Drivers.create({
        name: u.name,
        email: u.email,
        role: pickedRole,
        phone: '',
      });
    } else {
      // Vincular a un registro de personal ya existente: le pone el
      // correo con el que acaba de entrar, para que la próxima vez que
      // inicie sesión el sistema ya lo reconozca directo (sin pasar
      // otra vez por "sin_rol").
      await Drivers.update(existingStaffId, { email: u.email, role: pickedRole });
    }
    await Users.update(u.id, { role: pickedRole, staffId });
    cancelAssign();
  }

  // Registros de personal del rol elegido que todavía no tienen correo
  // (probablemente los dio de alta el admin desde "Operadores y nannies"
  // antes de que esa persona haya entrado nunca a la app).
  const linkableStaff = drivers.filter((d) => d.role === pickedRole && !d.email);

  return (
    <div>
      <h1 className="admin-h1 mb-1">Personas con acceso</h1>
      <p className="text-sm text-navy-400 mb-5">
        Todos los que han entrado con su cuenta de Google institucional aparecen aquí. Nadie
        tiene permisos hasta que le asignas un rol.
      </p>

      <div className="admin-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-admin">
            <thead>
              <tr>
                <th className="pl-5">Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Último acceso</th>
                <th className="pr-5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u, i) => (
                <Fragment key={u.id}>
                  <tr className="cascade-item" style={cascadeStyle(i)}>
                    <td className="pl-5 font-medium text-navy-700">
                      {u.name}
                      {u.activo === false && <span className="badge-stop ml-2">Suspendido</span>}
                    </td>
                    <td className="text-navy-500">{u.email}</td>
                    <td>
                      <span className={ROLE_META[u.role]?.badgeClass || 'badge'}>
                        {ROLE_META[u.role]?.label || u.role}
                      </span>
                    </td>
                    <td className="text-navy-400 text-xs">{u.ultimoAcceso ? fmtTimestamp24(u.ultimoAcceso) : '—'}</td>
                    <td className="pr-5">
                      <div className="flex flex-wrap gap-2">
                        {u.role !== 'admin' && (
                          <button onClick={() => toggleAdmin(u, true)} className="link-action flex items-center gap-1">
                            <ShieldCheck size={12} /> Hacer admin
                          </button>
                        )}
                        {u.role === 'admin' && (
                          <button onClick={() => toggleAdmin(u, false)} className="link-danger flex items-center gap-1">
                            Quitar admin
                          </button>
                        )}
                        {STAFF_ROLE_OPTIONS.map((opt) => (
                          <button
                            key={opt.role}
                            onClick={() => startAssign(u, opt.role)}
                            className="link-action flex items-center gap-1"
                          >
                            <opt.icon size={12} /> {opt.label}
                          </button>
                        ))}
                        {u.activo === false ? (
                          <button onClick={() => toggleActive(u, true)} className="link-action flex items-center gap-1">
                            <RotateCcw size={12} /> Reactivar
                          </button>
                        ) : (
                          <button onClick={() => toggleActive(u, false)} className="link-danger flex items-center gap-1">
                            <Ban size={12} /> Suspender
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {assigningFor === u.id && (
                    <tr>
                      <td colSpan={5} className="bg-navy-50/60 px-5 py-4">
                        <p className="text-sm font-medium text-navy-700 mb-2">
                          Asignar a {u.name} como {STAFF_ROLE_OPTIONS.find((o) => o.role === pickedRole)?.label}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
                          <label className="flex items-center gap-1.5">
                            <input type="radio" checked={linkMode === 'new'} onChange={() => setLinkMode('new')} />
                            Crear registro nuevo con estos datos
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              checked={linkMode === 'existing'}
                              onChange={() => setLinkMode('existing')}
                              disabled={linkableStaff.length === 0}
                            />
                            Vincular a uno ya dado de alta sin correo {linkableStaff.length === 0 && '(no hay ninguno)'}
                          </label>
                        </div>
                        {linkMode === 'existing' && (
                          <select
                            value={existingStaffId}
                            onChange={(e) => setExistingStaffId(e.target.value)}
                            className="admin-select mb-3 max-w-xs"
                          >
                            <option value="">Selecciona…</option>
                            {linkableStaff.map((d) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => confirmAssign(u)}
                            disabled={linkMode === 'existing' && !existingStaffId}
                            className="btn-admin-primary"
                          >
                            <UserCheck size={14} /> Confirmar
                          </button>
                          <button onClick={cancelAssign} className="btn-admin-ghost">Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && (
          <p className="text-navy-400 text-sm py-6 text-center">Todavía nadie ha entrado con su cuenta de Google.</p>
        )}
      </div>
    </div>
  );
}
