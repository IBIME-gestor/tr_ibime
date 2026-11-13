import { useState } from 'react';
import { Search, CheckCircle2, AlertTriangle, Link2, ArrowRightLeft, Copy } from 'lucide-react';
import { listAll, getOne, updateDocById, where } from '../../../firebase/db';
import { logAudit } from '../../../firebase/audit';

const ROLE_LABEL = { driver: 'Operador', nanny: 'Nanny', cashier: 'Cajero(a)', admin: 'Administrador', sin_rol: 'Sin rol' };

/**
 * Soporte / Diagnóstico de operador
 * Permite ver y corregir, desde la app (sin entrar a la consola de Firebase),
 * el vínculo entre la cuenta de una persona (users.staffId) y su registro en
 * "Operadores y nannies" (drivers), que es el que lleva las rutas asignadas.
 *
 * Lecturas por búsqueda: pocas (registros de esa persona + sus rutas).
 */
export default function DiagnosticoOperador() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState(null); // { staff: [], users: [], routesByStaff: {} }

  async function search(e) {
    e?.preventDefault();
    const term = q.trim();
    if (!term) return;
    setLoading(true); setError(''); setMsg('');
    try {
      // 1) Registros de personal: por correo exacto o por nombre (prefijo)
      let staff = [];
      if (term.includes('@')) {
        staff = await listAll('drivers', [where('email', '==', term.toLowerCase())]);
      } else {
        const cap = term.charAt(0).toUpperCase() + term.slice(1);
        const [a, b] = await Promise.all([
          listAll('drivers', [where('name', '>=', term), where('name', '<=', `${term}\uf8ff`)]),
          cap !== term ? listAll('drivers', [where('name', '>=', cap), where('name', '<=', `${cap}\uf8ff`)]) : [],
        ]);
        const seen = new Set();
        staff = [...a, ...b].filter((s) => !seen.has(s.id) && seen.add(s.id));
      }

      // 2) Cuentas (users) que usan esos correos
      const emails = [...new Set(staff.map((s) => (s.email || '').toLowerCase()).filter(Boolean))];
      const userLists = await Promise.all(emails.map((em) => listAll('users', [where('email', '==', em)])));
      const users = userLists.flat();

      // 3) Si una cuenta apunta a un registro que no salió en la búsqueda, se trae
      const known = new Set(staff.map((s) => s.id));
      for (const u of users) {
        if (u.staffId && !known.has(u.staffId)) {
          const extra = await getOne('drivers', u.staffId).catch(() => null);
          if (extra) { staff.push(extra); known.add(extra.id); }
        }
      }

      // 4) Rutas asignadas a cada registro (como operador y como nanny)
      const routesByStaff = {};
      await Promise.all(staff.map(async (s) => {
        const [asDriver, asNanny] = await Promise.all([
          listAll('routes', [where('driverId', '==', s.id)]),
          listAll('routes', [where('nannyId', '==', s.id)]),
        ]);
        routesByStaff[s.id] = [
          ...asDriver.map((r) => ({ ...r, as: 'driverId' })),
          ...asNanny.map((r) => ({ ...r, as: 'nannyId' })),
        ];
      }));

      setResult({ staff, users, routesByStaff });
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudo consultar. Si Firebase superó su límite diario, espera al reinicio o pasa al plan Blaze.');
    } finally {
      setLoading(false);
    }
  }

  async function linkProfile(user, staffRec) {
    if (!window.confirm(`¿Ligar la cuenta de ${user.email} al registro "${staffRec.name}" (${staffRec.id})?\n\nLa persona debe cerrar sesión y volver a entrar.`)) return;
    try {
      await updateDocById('users', user.id, { staffId: staffRec.id, name: staffRec.name || user.name });
      logAudit({ entity: 'staff', entityId: user.id, entityName: user.email, action: 'update',
        changes: { staffId: { from: user.staffId || '', to: staffRec.id } }, source: 'Soporte/Diagnóstico de operador' });
      setMsg('Cuenta ligada. Pide a la persona que cierre sesión y vuelva a entrar.');
      await search();
    } catch (err) { setError(err?.message || 'No se pudo guardar.'); }
  }

  async function moveRoutes(from, to) {
    const routes = result.routesByStaff[from.id] || [];
    if (!routes.length) return;
    if (!window.confirm(`¿Pasar ${routes.length} ruta(s) de "${from.name}" (${from.id}) a "${to.name}" (${to.id})?`)) return;
    try {
      for (const r of routes) {
        await updateDocById('routes', r.id, { [r.as]: to.id });
        logAudit({ entity: 'route', entityId: r.id, entityName: r.name || '', action: 'update',
          changes: { [r.as]: { from: from.id, to: to.id } }, source: 'Soporte/Diagnóstico de operador' });
      }
      setMsg(`${routes.length} ruta(s) reasignadas.`);
      await search();
    } catch (err) { setError(err?.message || 'No se pudo guardar.'); }
  }

  const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-800">Diagnóstico de operador</h1>
        <p className="text-sm text-navy-400 mt-1">
          Busca por correo o nombre para ver con qué registro está ligada su cuenta y qué rutas tiene ese registro.
        </p>
      </div>

      <form onSubmit={search} className="card p-4 flex flex-col sm:flex-row gap-3">
        <input
          className="admin-input"
          placeholder="correo@ibime.edu.mx o nombre"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-admin-primary" disabled={loading}>
          <Search size={16} /> {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {error && <p className="text-sm text-stop bg-red-50 rounded-md p-3">{error}</p>}
      {msg && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-md p-3">{msg}</p>}

      {result && result.staff.length === 0 && (
        <p className="text-sm text-navy-400">No se encontró ningún registro en Operadores y nannies con ese dato.</p>
      )}

      {result && result.staff.length > 0 && (
        <>
          {/* Cuentas */}
          <section className="card p-4 space-y-3">
            <h2 className="font-display font-semibold text-navy-800">Cuenta de acceso (users)</h2>
            {result.users.length === 0 && (
              <p className="text-sm text-navy-400">
                Esta persona todavía no ha entrado a la app, así que no tiene cuenta. Cuando entre por primera vez se ligará sola.
              </p>
            )}
            {result.users.map((u) => {
              const linked = result.staff.find((s) => s.id === u.staffId);
              const linkedRoutes = linked ? (result.routesByStaff[linked.id] || []).length : 0;
              const alternatives = result.staff.filter(
                (s) => s.id !== u.staffId && (s.email || '').toLowerCase() === (u.email || '').toLowerCase()
              );
              const ok = linked && linkedRoutes > 0;
              return (
                <div key={u.id} className="rounded-md border border-navy-100 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    {ok
                      ? <CheckCircle2 size={16} className="text-emerald-600" />
                      : <AlertTriangle size={16} className="text-amber-600" />}
                    <span className="font-semibold text-navy-800">{u.email}</span>
                    <span className="badge">{ROLE_LABEL[u.role] || u.role}</span>
                  </div>
                  <p className="text-xs text-navy-500">
                    UID: <code>{u.id}</code>{' '}
                    <button type="button" className="link-action" onClick={() => copy(u.id)}><Copy size={11} className="inline" /> copiar</button>
                    <br />
                    Ligada al registro: <code>{u.staffId || '— ninguno —'}</code>
                    {linked ? <> ({linked.name})</> : u.staffId ? <b className="text-stop"> · ese registro ya no existe</b> : null}
                  </p>
                  {linked && linkedRoutes === 0 && (
                    <p className="text-xs text-amber-700">
                      Ese registro no tiene rutas asignadas, por eso la persona ve “Sin ruta asignada”.
                    </p>
                  )}
                  {ok && <p className="text-xs text-emerald-700">Todo correcto: su registro tiene {linkedRoutes} ruta(s).</p>}

                  {/* Acciones de corrección */}
                  {alternatives.map((alt) => {
                    const altRoutes = (result.routesByStaff[alt.id] || []).length;
                    return (
                      <div key={alt.id} className="flex flex-wrap items-center gap-2 text-xs border-t border-navy-50 pt-2">
                        <span className="text-navy-600">
                          Otro registro con el mismo correo: <b>{alt.name}</b> (<code>{alt.id}</code>) · {altRoutes} ruta(s)
                        </span>
                        <button type="button" className="btn-admin-ghost !h-8 !px-3" onClick={() => linkProfile(u, alt)}>
                          <Link2 size={13} /> Ligar la cuenta a este registro
                        </button>
                        {linked && altRoutes > 0 && (
                          <button type="button" className="btn-admin-ghost !h-8 !px-3" onClick={() => moveRoutes(alt, linked)}>
                            <ArrowRightLeft size={13} /> Pasar sus rutas al registro de la cuenta
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>

          {/* Registros de personal */}
          <section className="card p-4 space-y-3">
            <h2 className="font-display font-semibold text-navy-800">Registros en Operadores y nannies</h2>
            {result.staff.map((s) => {
              const routes = result.routesByStaff[s.id] || [];
              return (
                <div key={s.id} className="rounded-md border border-navy-100 p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-navy-800">{s.name}</span>
                    <span className="badge">{ROLE_LABEL[s.role] || 'Operador'}</span>
                    <span className="text-xs text-navy-400">{s.email || 'sin correo'}</span>
                  </div>
                  <p className="text-xs text-navy-500">
                    ID: <code>{s.id}</code>{' '}
                    <button type="button" className="link-action" onClick={() => copy(s.id)}><Copy size={11} className="inline" /> copiar</button>
                  </p>
                  <p className="text-xs text-navy-600">
                    {routes.length === 0
                      ? 'Sin rutas asignadas.'
                      : `Rutas: ${routes.map((r) => `${r.name || r.id} (${r.as === 'nannyId' ? 'nanny' : 'operador'})`).join(', ')}`}
                  </p>
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
