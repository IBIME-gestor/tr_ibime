import { useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Search, CheckCircle2, AlertTriangle, Wrench } from 'lucide-react';
import { db } from '../../../firebase/config';

/**
 * Soporte / Vincular operador
 * Diagnostica por qué un operador ve "Sin ruta asignada" aunque el admin ya
 * le asignó rutas. Hace pocas lecturas dirigidas (no carga colecciones
 * completas), así que sirve aun con la cuota de Firestore casi agotada.
 *
 * Causa típica: users/{uid}.staffId (que se guarda la PRIMERA vez que el
 * operador entra) apunta a un documento de `drivers` distinto al que tiene
 * las rutas (p. ej. se registró dos veces, o entró antes de que se le diera
 * de alta). Aquí se ve y se repara con un clic.
 */
export default function VincularOperador() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [done, setDone] = useState('');

  async function buscar(e) {
    e?.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!mail) return;
    setBusy(true); setError(''); setData(null); setDone('');
    try {
      const [dSnap, uSnap] = await Promise.all([
        getDocs(query(collection(db, 'drivers'), where('email', '==', mail))),
        getDocs(query(collection(db, 'users'), where('email', '==', mail))),
      ]);
      const drivers = [];
      for (const d of dSnap.docs) {
        const [asDriver, asNanny] = await Promise.all([
          getDocs(query(collection(db, 'routes'), where('driverId', '==', d.id))),
          getDocs(query(collection(db, 'routes'), where('nannyId', '==', d.id))),
        ]);
        drivers.push({
          id: d.id,
          ...d.data(),
          routes: [...asDriver.docs, ...asNanny.docs].map((r) => ({ id: r.id, name: r.data().name })),
        });
      }
      setData({ mail, drivers, users: uSnap.docs.map((u) => ({ uid: u.id, ...u.data() })) });
    } catch (err) {
      setError(err.message || 'No se pudo consultar. Si dice "quota", Firestore sigue sin cuota: reintenta tras el reinicio diario.');
    } finally {
      setBusy(false);
    }
  }

  async function reparar(uid, driver) {
    setBusy(true); setError(''); setDone('');
    try {
      await updateDoc(doc(db, 'users', uid), {
        staffId: driver.id,
        role: driver.role === 'nanny' || driver.role === 'cashier' ? driver.role : 'driver',
        name: driver.name || '',
        updatedAt: serverTimestamp(),
      });
      setDone('Listo. Pídele al operador cerrar sesión y volver a entrar.');
      await buscar();
    } catch (err) {
      setError(err.message || 'No se pudo reparar.');
      setBusy(false);
    }
  }

  const withRoutes = data?.drivers.filter((d) => d.routes.length) || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl">Vincular operador</h1>
        <p className="text-sm text-navy-400">Revisa por qué un operador ve «Sin ruta asignada». Solo hace lecturas puntuales por correo.</p>
      </div>

      <form onSubmit={buscar} className="card flex gap-2">
        <input className="admin-input flex-1" type="email" placeholder="correo del operador" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-admin-primary" disabled={busy}><Search size={16} /> Buscar</button>
      </form>

      {error && <div className="card text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
      {done && <div className="card text-sm text-green-800 bg-green-50 border border-green-200">{done}</div>}

      {data && (
        <div className="space-y-3">
          <div className="card">
            <p className="font-semibold mb-2">Registros en «Operadores» con ese correo: {data.drivers.length}</p>
            {data.drivers.length === 0 && <p className="text-sm text-red-700">No hay operador con ese correo (revisa mayúsculas/espacios o que esté bien escrito).</p>}
            {data.drivers.length > 1 && <p className="text-sm text-amber-700 mb-2">⚠️ Está duplicado. Solo uno debería tener las rutas.</p>}
            {data.drivers.map((d) => (
              <div key={d.id} className="text-sm border-t border-navy-100 py-2">
                <p><b>{d.name}</b> · ID <code className="text-xs">{d.id}</code> · rol {d.role || 'driver'}</p>
                <p className="text-navy-500">Rutas asignadas: {d.routes.length ? d.routes.map((r) => r.name).join(', ') : 'ninguna'}</p>
              </div>
            ))}
          </div>

          <div className="card">
            <p className="font-semibold mb-2">Cuenta de acceso (users) con ese correo: {data.users.length}</p>
            {data.users.length === 0 && <p className="text-sm text-navy-500">Aún no ha entrado nunca con Google; al entrar se vinculará solo.</p>}
            {data.users.map((u) => {
              const linked = data.drivers.find((d) => d.id === u.staffId);
              const target = withRoutes[0] || data.drivers[0];
              const ok = linked && linked.routes.length > 0;
              return (
                <div key={u.uid} className="text-sm border-t border-navy-100 py-2 space-y-1">
                  <p>UID <code className="text-xs">{u.uid}</code> · staffId <code className="text-xs">{u.staffId || '—'}</code></p>
                  {ok ? (
                    <p className="text-green-700 flex items-center gap-1"><CheckCircle2 size={14} /> Vinculado correctamente a un registro con rutas.</p>
                  ) : (
                    <>
                      <p className="text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={14} />
                        {linked ? 'Está ligado a un registro sin rutas.' : 'Su staffId no coincide con ningún operador con ese correo (registro viejo o borrado).'}
                      </p>
                      {target && (
                        <button className="btn-admin-primary" disabled={busy} onClick={() => reparar(u.uid, target)}>
                          <Wrench size={14} /> Ligar a «{target.name}» ({target.routes.length} ruta{target.routes.length === 1 ? '' : 's'})
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
