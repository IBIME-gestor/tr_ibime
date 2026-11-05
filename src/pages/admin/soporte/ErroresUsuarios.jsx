import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, orderBy, limit, getDocs, where, writeBatch, doc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import {
  RefreshCw, AlertTriangle, CheckCircle2, Search, ChevronDown, Trash2, RotateCcw, Smartphone, Trash,
} from 'lucide-react';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';
import { ERROR_RETENTION_DAYS } from '../../../utils/errorLog';
import { fmtAgo } from '../../../utils/tripStatus';

const ROLE_LABEL = {
  parent: 'Papá / mamá',
  portal: 'Portal de operador',
  driver: 'Operador',
  nanny: 'Nanny',
  cashier: 'Cajero',
  admin: 'Admin',
  anon: 'Sin sesión',
};
const ROLE_CLS = {
  parent: 'bg-fuchsia-100 text-fuchsia-800',
  portal: 'bg-teal-100 text-teal-800',
  driver: 'bg-sky-100 text-sky-800',
  nanny: 'bg-indigo-100 text-indigo-800',
  cashier: 'bg-amber-100 text-amber-800',
  admin: 'bg-slate-200 text-slate-800',
  anon: 'bg-slate-100 text-slate-700',
};
const SOURCE_LABEL = {
  window: 'Error de la página',
  promise: 'Promesa rechazada',
  react: 'Falla de pantalla',
  console: 'Consola (F12)',
};
const PERIODS = [
  { key: 1, label: 'Últimas 24 h' },
  { key: 7, label: '7 días' },
  { key: 45, label: '45 días (todo)' },
];

const ms = (ts) => (ts?.toMillis ? ts.toMillis() : null);
const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Soporte / Errores de usuarios
 * Lo que le pasa a papás, operadores, nannies y cajeros (lo que se vería en
 * la consola con F12), agrupado por tipo de error. Se conserva 45 días.
 */
export default function ErroresUsuarios() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('open');
  const [role, setRole] = useState('');
  const [source, setSource] = useState('');
  const [period, setPeriod] = useState(45);
  const [search, setSearch] = useState('');
  const [openKey, setOpenKey] = useState(null);
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(Date.now());

  async function load() {
    setLoading(true); setError('');
    try {
      const snap = await getDocs(query(collection(db, 'clientErrors'), orderBy('createdAt', 'desc'), limit(500)));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setNow(Date.now());
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudieron cargar los errores.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Agrupa por huella: un mismo error, aunque le haya pasado a varias personas.
  const groups = useMemo(() => {
    const since = now - period * 86400000;
    const q = search.trim().toLowerCase();
    const map = new Map();
    rows.forEach((r) => {
      const t = ms(r.createdAt) || 0;
      if (t < since) return;
      if (role && r.role !== role) return;
      if (source && r.source !== source) return;
      const key = r.fingerprint || r.id;
      const g = map.get(key) || { key, items: [], message: r.message, source: r.source, route: r.route };
      g.items.push(r);
      map.set(key, g);
    });
    return [...map.values()]
      .map((g) => {
        const open = g.items.filter((i) => i.status !== 'resolved').length;
        return {
          ...g,
          open,
          lastAt: Math.max(...g.items.map((i) => ms(i.createdAt) || 0)),
          sessions: new Set(g.items.map((i) => i.sessionId)).size,
          people: new Set(g.items.map((i) => i.actorName || i.uid || i.sessionId)).size,
          roles: [...new Set(g.items.map((i) => i.role))],
          sample: g.items[0],
        };
      })
      .filter((g) => (status === 'open' ? g.open > 0 : status === 'resolved' ? g.open === 0 : true))
      .filter((g) => !q || `${g.message} ${g.route} ${g.items.map((i) => `${i.actorName} ${i.device}`).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => b.lastAt - a.lastAt);
  }, [rows, role, source, period, search, status, now]);

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status !== 'resolved');
    const day = now - 86400000;
    return {
      openGroups: new Set(open.map((r) => r.fingerprint || r.id)).size,
      last24: rows.filter((r) => (ms(r.createdAt) || 0) > day).length,
      parents: open.filter((r) => r.role === 'parent').length,
      staff: open.filter((r) => ['driver', 'nanny', 'portal', 'cashier'].includes(r.role)).length,
    };
  }, [rows, now]);

  async function setGroupStatus(group, next) {
    setBusy(group.key); setError(''); setNotice('');
    try {
      const batch = writeBatch(db);
      group.items.forEach((i) => {
        batch.update(doc(db, 'clientErrors', i.id), {
          status: next,
          resolvedAt: next === 'resolved' ? serverTimestamp() : null,
          resolvedBy: next === 'resolved' ? (profile?.name || '') : '',
        });
      });
      await batch.commit();
      setRows((prev) => prev.map((r) => (group.items.some((i) => i.id === r.id) ? { ...r, status: next } : r)));
      setNotice(next === 'resolved' ? 'Marcado como resuelto.' : 'Reabierto.');
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar.');
    } finally { setBusy(''); }
  }

  async function removeGroup(group) {
    if (!window.confirm(`¿Eliminar este error y sus ${group.items.length} registro(s)?`)) return;
    setBusy(group.key); setError(''); setNotice('');
    try {
      const batch = writeBatch(db);
      group.items.forEach((i) => batch.delete(doc(db, 'clientErrors', i.id)));
      await batch.commit();
      setRows((prev) => prev.filter((r) => !group.items.some((i) => i.id === r.id)));
      setNotice('Eliminado.');
    } catch (e) {
      setError(e?.message || 'No se pudo eliminar.');
    } finally { setBusy(''); }
  }

  // Respaldo manual de la política TTL: borra lo que ya pasó de 45 días.
  async function purgeExpired() {
    if (!window.confirm(`¿Borrar los errores con más de ${ERROR_RETENTION_DAYS} días?`)) return;
    setBusy('purge'); setError(''); setNotice('');
    try {
      let total = 0;
      for (;;) {
        const snap = await getDocs(query(collection(db, 'clientErrors'), where('expireAt', '<', Timestamp.now()), limit(400)));
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        total += snap.size;
        if (snap.size < 400) break;
      }
      setNotice(total ? `Se borraron ${total} registro(s) vencidos.` : 'No había registros vencidos.');
      load();
    } catch (e) {
      setError(e?.message || 'No se pudo limpiar.');
    } finally { setBusy(''); }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-navy-400 font-semibold">Soporte</p>
          <h1 className="admin-h1 mt-1">Errores de usuarios</h1>
          <p className="text-sm text-navy-500 mt-1 max-w-2xl">
            Lo que les falla a papás, operadores, nannies y cajeros, igual que lo verías en la consola (F12).
            Cada error se agrupa aunque le haya pasado a varias personas, y se conserva {ERROR_RETENTION_DAYS} días.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-admin-ghost" onClick={purgeExpired} disabled={!!busy} title={`Borra lo que tenga más de ${ERROR_RETENTION_DAYS} días`}>
            <Trash size={14} /> Limpiar vencidos
          </button>
          <button className="btn-admin-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-sm flex gap-2">
          <AlertTriangle size={18} className="shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-sm flex gap-2">
          <CheckCircle2 size={18} className="shrink-0" /> {notice}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Errores distintos abiertos" value={stats.openGroups} tone={stats.openGroups ? 'amber' : 'ok'} />
        <Tile label="Registros últimas 24 h" value={stats.last24} />
        <Tile label="Afectan a papás" value={stats.parents} tone={stats.parents ? 'pink' : ''} />
        <Tile label="Afectan a personal" value={stats.staff} tone={stats.staff ? 'sky' : ''} />
      </div>

      <section className="admin-card space-y-3">
        <div className="flex flex-wrap gap-2">
          {[['open', 'Abiertos'], ['resolved', 'Resueltos'], ['all', 'Todos']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStatus(k)} className={status === k ? 'btn-admin-primary' : 'btn-admin-ghost'}>{l}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <select className="admin-select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Todos los usuarios</option>
            {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="admin-select" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Todos los tipos</option>
            {Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="admin-select" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input className="admin-input !pl-9" placeholder="Buscar mensaje, persona, equipo…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-navy-500">Cargando…</p>
      ) : groups.length === 0 ? (
        <div className="admin-card text-center py-10 text-navy-500">
          <CheckCircle2 size={26} className="mx-auto mb-2 text-emerald-500" />
          <p className="text-sm">Sin errores en este filtro. 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isOpen = openKey === g.key;
            const resolved = g.open === 0;
            return (
              <div key={g.key} className={`rounded-2xl border bg-white overflow-hidden shadow-sm ${resolved ? 'border-navy-100' : 'border-amber-200'}`}>
                <div className="flex">
                  <div className={`w-1.5 shrink-0 ${resolved ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0 p-4">
                    <button className="w-full text-left flex items-start justify-between gap-3" onClick={() => setOpenKey(isOpen ? null : g.key)}>
                      <div className="min-w-0 space-y-1.5">
                        <p className="font-semibold text-navy-900 break-words">{g.message}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {g.roles.map((r) => (
                            <span key={r} className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${ROLE_CLS[r] || ROLE_CLS.anon}`}>{ROLE_LABEL[r] || r}</span>
                          ))}
                          <span className="text-[11px] rounded-full px-2 py-0.5 bg-navy-100 text-navy-700">{SOURCE_LABEL[g.source] || g.source}</span>
                          {resolved && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800">Resuelto</span>}
                        </div>
                        <p className="text-xs text-navy-500">
                          <b>{g.items.length}</b> vez/veces · {g.people} persona(s) · {g.sessions} sesión(es) · última {fmtAgo(g.lastAt, now)} ({fmtDateTime(g.lastAt)})
                        </p>
                        <p className="text-xs text-navy-400 flex items-center gap-1 break-all">
                          <Smartphone size={11} className="shrink-0" /> {g.route || '—'} · {g.sample?.device}
                        </p>
                      </div>
                      <ChevronDown size={18} className="text-navy-400 shrink-0 mt-1 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                    </button>

                    {isOpen && (
                      <div className="mt-4 pt-4 border-t border-navy-100 space-y-3">
                        {g.sample?.stack && (
                          <pre className="text-[11px] leading-relaxed bg-navy-900 text-navy-50 rounded-xl p-3 overflow-x-auto max-h-56 whitespace-pre-wrap break-words">{g.sample.stack}</pre>
                        )}
                        <div className="overflow-x-auto rounded-xl border border-navy-100">
                          <table className="table-admin text-xs min-w-[560px]">
                            <thead><tr><th className="pl-3">Cuándo</th><th>Quién</th><th>Equipo</th><th>Pantalla</th><th>Conexión</th></tr></thead>
                            <tbody>
                              {g.items.slice(0, 25).map((i) => (
                                <tr key={i.id}>
                                  <td className="pl-3 whitespace-nowrap">{fmtDateTime(ms(i.createdAt))}</td>
                                  <td>{i.actorName || (i.role === 'parent' ? 'Papá / mamá (anónimo)' : 'Anónimo')}{i.actorEmail ? <span className="block text-navy-400">{i.actorEmail}</span> : null}</td>
                                  <td>{i.device}<span className="block text-navy-400">{i.viewport}</span></td>
                                  <td className="break-all">{i.route}</td>
                                  <td>{i.online === false ? 'Sin internet' : 'En línea'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {g.items.length > 25 && <p className="text-xs text-navy-400">Se muestran los 25 más recientes de {g.items.length}.</p>}
                        <div className="flex flex-wrap gap-2">
                          {resolved ? (
                            <button className="btn-admin-ghost" disabled={busy === g.key} onClick={() => setGroupStatus(g, 'open')}><RotateCcw size={13} /> Reabrir</button>
                          ) : (
                            <button className="btn-admin-primary" disabled={busy === g.key} onClick={() => setGroupStatus(g, 'resolved')}><CheckCircle2 size={13} /> Marcar como resuelto</button>
                          )}
                          <button className="btn-admin-ghost text-red-700 border-red-200" disabled={busy === g.key} onClick={() => removeGroup(g)}><Trash2 size={13} /> Eliminar</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-navy-400">Se cargan los 500 registros más recientes. Los errores iguales de una misma sesión se mandan una sola vez para cuidar las escrituras.</p>
    </div>
  );
}

function Tile({ label, value, tone = '' }) {
  const cls = {
    amber: 'border-amber-300 bg-amber-50 text-amber-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    pink: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
  }[tone] || 'border-navy-100 bg-white text-navy-900';
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-3xl font-display font-bold mt-0.5">{value}</p>
    </div>
  );
}
