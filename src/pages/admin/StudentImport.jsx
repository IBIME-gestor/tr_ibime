import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Link, useNavigate } from 'react-router-dom';
import { Schools, Students } from '../../firebase/services';
import { normalizePhone } from '../../utils/phone';

// Columnas esperadas para validar el padrón antes de importarlo.
// address y parentEmail siguen siendo opcionales.
const REQUIRED_COLUMNS = ['matricula', 'name', 'correo alumno', 'school', 'nivel', 'grado', 'grupo esp', 'familiar responsable', 'telefono', 'correo padre familia'];

const COLUMN_ALIASES = {
  'matrícula': 'matricula',
  'nombre': 'name',
  'plantel': 'school',
  'grupo': 'grupo esp',
  'grupo_especial': 'grupo esp',
  'grupoesp': 'grupo esp',
  'familiar': 'familiar responsable',
  'responsable': 'familiar responsable',
  'teléfono': 'telefono',
  'phone': 'telefono',
  'parentcontact': 'telefono',
  'correo': 'correo alumno',
  'correo alumno': 'correo alumno',
  'email alumno': 'correo alumno',
  'studentemail': 'correo alumno',
  'student email': 'correo alumno',
  'correo padre': 'correo padre familia',
  'correo padre familia': 'correo padre familia',
  'email padre': 'correo padre familia',
  'parentemail': 'correo padre familia',
  'parent email': 'correo padre familia',
};

function normalizeHeader(h) {
  const normalized = String(h || '').trim().toLowerCase();
  return COLUMN_ALIASES[normalized] || normalized;
}

// Lee un .xlsx/.xls real (binario) con SheetJS y regresa filas con los
// encabezados ya normalizados, igual que hace Papa con el CSV.
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        // Segunda lectura con los valores reales: con raw:false un teléfono
        // numérico llega como el texto que mostraba Excel ("5.25512E+11"),
        // con los dígitos ya recortados. El valor real sí conserva los 12 dígitos.
        const real = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
        const rows = raw.map((row, i) => {
          const out = {};
          Object.entries(row).forEach(([key, value]) => {
            const name = normalizeHeader(key);
            const exact = real[i]?.[key];
            const v = name === 'telefono' && typeof exact === 'number' ? exact : value;
            out[name] = typeof v === 'string' ? v.trim() : v;
          });
          return out;
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
}

export default function StudentImport() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileError, setFileError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  // Modo "solo corregir teléfonos": actualiza alumnos existentes por matrícula.
  const [phoneOnly, setPhoneOnly] = useState(false);
  const [existing, setExisting] = useState(null); // Map matrícula -> alumno
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => Schools.subscribe(setSchools), []);

  // Una sola lectura de todos los alumnos (≈4 000) en vez de una consulta por fila.
  useEffect(() => {
    if (!phoneOnly || existing) return;
    setLoadingExisting(true);
    Students.list()
      .then((list) => {
        const map = new Map();
        list.forEach((st) => { const m = String(st.matricula || '').trim(); if (m) map.set(m, st); });
        setExisting(map);
      })
      .catch(() => setFileError('No se pudo leer la lista de alumnos.'))
      .finally(() => setLoadingExisting(false));
  }, [phoneOnly, existing]);

  const phoneReport = useMemo(() => {
    if (!phoneOnly || !existing || !rows.length) return null;
    const toUpdate = new Map();
    const notFound = [];
    const bad = [];
    let same = 0;
    rows.forEach((row) => {
      const mat = String(row.matricula ?? '').trim();
      if (!mat) return;
      const st = existing.get(mat);
      if (!st) { notFound.push(mat); return; }
      const tel = normalizePhone(row.telefono);
      if (tel.status !== 'ok') { bad.push({ mat, name: st.name, raw: String(row.telefono ?? '') }); return; }
      if (st.telefono === tel.phone && st.parentContact === tel.phone) { same += 1; return; }
      toUpdate.set(st.id, { id: st.id, matricula: mat, name: st.name, from: st.telefono || st.parentContact || '', telefono: tel.phone });
    });
    return { toUpdate: [...toUpdate.values()], notFound, bad, same };
  }, [phoneOnly, existing, rows]);

  function togglePhoneOnly(value) {
    setPhoneOnly(value);
    setRows([]);
    setResult(null);
    setFileError('');
  }

  function applyRows(cols, data) {
    const needed = phoneOnly ? ['matricula', 'telefono'] : REQUIRED_COLUMNS;
    const missing = needed.filter((c) => !cols.includes(c));
    if (missing.length) {
      setFileError(`Faltan columnas en el archivo: ${missing.join(', ')}`);
      setRows([]);
      return;
    }
    if (phoneOnly) { setRows(data); setEditingIndex(null); return; }
    setRows(data.map((row) => ({
      ...row,
      'grupo esp': row['grupo esp'] ?? '',
      'familiar responsable': row['familiar responsable'] ?? '',
      telefono: normalizePhone(row.telefono).phone || String(row.telefono ?? ''),
      'correo alumno': row['correo alumno'] ?? '',
      'correo padre familia': row['correo padre familia'] ?? '',
    })));
    setEditingIndex(null);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileError('');
    setResult(null);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isExcel) {
      parseExcelFile(file)
        .then((data) => applyRows(Object.keys(data[0] || {}), data))
        .catch(() => setFileError('No se pudo leer el archivo de Excel. Verifica que no esté dañado o protegido.'));
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (res) => applyRows(res.meta.fields || [], res.data),
      error: () => setFileError('No se pudo leer el archivo.'),
    });
  }

  function schoolIdFor(name) {
    const match = schools.find(
      (s) => s.name.trim().toLowerCase() === (name || '').trim().toLowerCase()
    );
    return match?.id || null;
  }

  async function handlePhoneUpdate() {
    if (!phoneReport) return;
    setImporting(true);
    try {
      const updated = await Students.bulkUpdatePhones(phoneReport.toUpdate);
      setResult({ phoneOnly: true, updated, same: phoneReport.same, notFound: phoneReport.notFound.length, bad: phoneReport.bad.length });
      setExisting(null); // se recarga si se vuelve a usar
    } catch (err) {
      setFileError(err?.message || 'No se pudieron actualizar los teléfonos.');
    }
    setImporting(false);
  }

  async function handleImport() {
    setImporting(true);
    const valid = [];
    const failed = [];
    let badPhones = 0;
    for (const row of rows) {
      const schoolId = schoolIdFor(row.school);
      if (!row.matricula || !row.name || !schoolId) {
        failed.push(row);
        continue;
      }
      const tel = normalizePhone(row.telefono);
      if (tel.status === 'broken' || tel.status === 'invalid') badPhones += 1;
      valid.push({
        matricula: String(row.matricula).trim(),
        name: String(row.name).trim(),
        schoolId,
        nivel: String(row.nivel || '').trim(),
        grado: String(row.grado || '').trim(),
        grupoEsp: String(row['grupo esp'] || '').trim(),
        familiarResponsable: String(row['familiar responsable'] || '').trim(),
        telefono: tel.phone,
        address: row.address || '',
        parentContact: tel.phone,
        studentEmail: String(row['correo alumno'] || '').trim().toLowerCase(),
        parentEmail: String(row['correo padre familia'] || '').trim().toLowerCase(),
      });
    }
      const r = valid.length ? await Students.bulkImport(valid) : { total: 0, created: 0, updated: 0 };
      const ok = typeof r === 'number' ? r : r.total;
      setImporting(false);
      setResult({ ok, failed, badPhones });
  }

  return (
    <div className="max-w-2xl">
      <Link to="/admin/alumnos" className="link-action">← Volver a alumnos</Link>
      <h1 className="admin-h1 mt-2 mb-2">Cargar alumnos por CSV o Excel</h1>
      <p className="text-navy-400 text-sm mb-5">
        Acepta archivos <code className="bg-navy-100 px-1 rounded">.csv</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">.xlsx</code> o{' '}
        <code className="bg-navy-100 px-1 rounded">.xls</code>. La primera fila debe tener
        columnas: <code className="bg-navy-100 px-1 rounded">matricula</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">name</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">school</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">nivel</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">grado</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">grupo esp</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">familiar responsable</code> y{' '}
        <code className="bg-navy-100 px-1 rounded">telefono</code>.{' '}
        <code className="bg-navy-100 px-1 rounded">address</code> y <code className="bg-navy-100 px-1 rounded">parentEmail</code> son opcionales.
      </p>

      <div className="admin-card space-y-4">
        <label className="flex items-start gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={phoneOnly} onChange={(e) => togglePhoneOnly(e.target.checked)} className="mt-1" />
          <span>
            <b>Solo corregir teléfonos de alumnos que ya existen</b> (los busca por matrícula, no crea ni duplica alumnos).
            El archivo solo necesita las columnas <code className="bg-navy-100 px-1 rounded">matricula</code> y <code className="bg-navy-100 px-1 rounded">telefono</code>.
          </span>
        </label>
        {phoneOnly && loadingExisting && <p className="text-sm text-navy-400">Cargando alumnos registrados…</p>}
        <input key={phoneOnly ? 'phone' : 'full'} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={phoneOnly && !existing} className="text-sm" />
        {fileError && <p className="text-stop text-sm">{fileError}</p>}

        {phoneOnly && phoneReport && !result && (
          <>
            <div className="text-sm text-navy-700 space-y-1">
              <p><b>{phoneReport.toUpdate.length}</b> teléfonos se van a actualizar.</p>
              <p className="text-navy-400">{phoneReport.same} ya estaban correctos.</p>
              {phoneReport.notFound.length > 0 && <p className="text-signal-amber">{phoneReport.notFound.length} matrículas no existen en el sistema (se omiten).</p>}
              {phoneReport.bad.length > 0 && <p className="text-stop">{phoneReport.bad.length} filas con teléfono inválido o en notación científica (se omiten; el teléfono actual no se toca).</p>}
            </div>
            {phoneReport.toUpdate.length > 0 && (
              <div className="overflow-x-auto max-h-64 border border-navy-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-navy-50"><tr className="text-left"><th className="p-2">Matrícula</th><th className="p-2">Nombre</th><th className="p-2">Antes</th><th className="p-2">Después</th></tr></thead>
                  <tbody>
                    {phoneReport.toUpdate.slice(0, 50).map((u) => (
                      <tr key={u.id} className="border-t border-navy-50"><td className="p-2">{u.matricula}</td><td className="p-2">{u.name}</td><td className="p-2 text-stop">{u.from || '—'}</td><td className="p-2 text-go">{u.telefono}</td></tr>
                    ))}
                  </tbody>
                </table>
                {phoneReport.toUpdate.length > 50 && <p className="p-2 text-xs text-navy-400">Se muestran los primeros 50 de {phoneReport.toUpdate.length}.</p>}
              </div>
            )}
            {phoneReport.bad.length > 0 && (
              <details className="text-xs text-navy-600">
                <summary className="cursor-pointer">Ver filas con teléfono inválido ({phoneReport.bad.length})</summary>
                <ul className="mt-1 max-h-40 overflow-auto">
                  {phoneReport.bad.slice(0, 200).map((b) => <li key={b.mat}>{b.mat} · {b.name} · “{b.raw}”</li>)}
                </ul>
              </details>
            )}
            <button onClick={handlePhoneUpdate} disabled={importing || phoneReport.toUpdate.length === 0} className="btn-admin bg-go text-white hover:bg-go/90">
              {importing ? 'Actualizando…' : `Actualizar ${phoneReport.toUpdate.length} teléfonos`}
            </button>
          </>
        )}

        {!phoneOnly && rows.length > 0 && !result && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-navy-600">{rows.length} filas detectadas. Revisa y corrige antes de importar:</p>
              <span className="text-xs text-navy-400">La edición aquí no modifica tu archivo original.</span>
            </div>
            <div className="overflow-x-auto max-h-[32rem] border border-navy-100 rounded-lg">
              <table className="w-full text-xs min-w-[1100px]">
                <thead className="sticky top-0 z-10 bg-navy-50">
                  <tr className="text-left">
                    <th className="p-2">Matrícula</th>
                    <th className="p-2">Nombre</th>
                    <th className="p-2">Correo alumno</th>
                    <th className="p-2">Plantel</th>
                    <th className="p-2">Nivel</th>
                    <th className="p-2">Grado</th>
                    <th className="p-2">Grupo ESP</th>
                    <th className="p-2">Familiar responsable</th>
                    <th className="p-2">Teléfono</th>
                    <th className="p-2">Correo padre familia</th>
                    <th className="p-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const editing = editingIndex === i;
                    const update = (key, value) => setRows((prev) => prev.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
                    return (
                      <tr key={i} className="border-t border-navy-50 align-top">
                        {['matricula','name','correo alumno','school','nivel','grado','grupo esp','familiar responsable','telefono','correo padre familia'].map((key) => (
                          <td key={key} className="p-2">
                            {editing ? (
                              <input
                                value={r[key] ?? ''}
                                onChange={(e) => update(key, e.target.value)}
                                className="admin-input py-1.5 text-xs min-w-[110px]"
                              />
                            ) : (
                              key === 'school' && !schoolIdFor(r.school) ? <span className="text-stop">{r.school} (no existe)</span>
                              : key === 'telefono' && r.telefono && normalizePhone(r.telefono).status !== 'ok' ? <span className="text-stop" title="Debe ser +52 y 10 dígitos">{r.telefono}</span>
                              : (r[key] || '—')
                            )}
                          </td>
                        ))}
                        <td className="p-2 whitespace-nowrap">
                          {editing ? (
                            <button type="button" onClick={() => setEditingIndex(null)} className="btn-admin-primary text-xs py-1.5">Guardar</button>
                          ) : (
                            <button type="button" onClick={() => setEditingIndex(i)} className="btn-admin-ghost text-xs py-1.5">Editar</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleImport}
              disabled={importing || editingIndex !== null}
              className="btn-admin bg-go text-white hover:bg-go/90"
            >
              {importing ? 'Importando…' : `Importar ${rows.length} alumnos`}
            </button>
            {editingIndex !== null && (
              <p className="text-xs text-signal-amber">Guarda la fila que estás editando antes de importar.</p>
            )}
          </>
        )}

        {result && (
          <div className="bg-go-light border border-go rounded-lg p-4">
            {result.phoneOnly ? (
              <>
                <p className="font-medium text-sm text-navy-800">Se actualizaron {result.updated} teléfonos.</p>
                <p className="text-xs text-navy-400 mt-1">{result.same} ya estaban correctos · {result.notFound} matrículas no encontradas · {result.bad} con teléfono inválido (sin cambios).</p>
              </>
            ) : (
              <p className="font-medium text-sm text-navy-800">Se importaron {result.ok} alumnos correctamente.</p>
            )}
            {!result.phoneOnly && result.failed.length > 0 && (
              <p className="text-sm text-stop mt-1">
                {result.failed.length} filas no se pudieron importar (matrícula, nombre o plantel inválido).
              </p>
            )}
            {!result.phoneOnly && result.badPhones > 0 && (
              <p className="text-sm text-signal-amber mt-1">
                {result.badPhones} alumnos quedaron sin teléfono válido (venía en notación científica, p. ej. 5.25E+11, o no tenía 10 dígitos). Corrígelos en el archivo y vuelve a cargarlos.
              </p>
            )}
            <button onClick={() => navigate('/admin/alumnos')} className="link-action mt-3">
              Ver lista de alumnos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
