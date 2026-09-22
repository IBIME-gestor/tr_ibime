import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Link, useNavigate } from 'react-router-dom';
import { Schools, Students } from '../../firebase/services';

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
        const rows = raw.map((row) => {
          const out = {};
          Object.entries(row).forEach(([key, value]) => {
            out[normalizeHeader(key)] = typeof value === 'string' ? value.trim() : value;
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

  useEffect(() => Schools.subscribe(setSchools), []);

  function applyRows(cols, data) {
    const missing = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
    if (missing.length) {
      setFileError(`Faltan columnas en el archivo: ${missing.join(', ')}`);
      setRows([]);
      return;
    }
    setRows(data.map((row) => ({
      ...row,
      'grupo esp': row['grupo esp'] ?? '',
      'familiar responsable': row['familiar responsable'] ?? '',
      telefono: row.telefono ?? '',
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

  async function handleImport() {
    setImporting(true);
    const valid = [];
    const failed = [];
    for (const row of rows) {
      const schoolId = schoolIdFor(row.school);
      if (!row.matricula || !row.name || !schoolId) {
        failed.push(row);
        continue;
      }
      valid.push({
        matricula: String(row.matricula).trim(),
        name: String(row.name).trim(),
        schoolId,
        nivel: String(row.nivel || '').trim(),
        grado: String(row.grado || '').trim(),
        grupoEsp: String(row['grupo esp'] || '').trim(),
        familiarResponsable: String(row['familiar responsable'] || '').trim(),
        telefono: String(row.telefono || '').trim(),
        address: row.address || '',
        parentContact: row.telefono || '',
        studentEmail: String(row['correo alumno'] || '').trim().toLowerCase(),
        parentEmail: String(row['correo padre familia'] || '').trim().toLowerCase(),
      });
    }
    const ok = valid.length ? await Students.bulkImport(valid) : 0;
    setImporting(false);
    setResult({ ok, failed });
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
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="text-sm" />
        {fileError && <p className="text-stop text-sm">{fileError}</p>}

        {rows.length > 0 && !result && (
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
                              key === 'school' && !schoolIdFor(r.school) ? <span className="text-stop">{r.school} (no existe)</span> : (r[key] || '—')
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
            <p className="font-medium text-sm text-navy-800">Se importaron {result.ok} alumnos correctamente.</p>
            {result.failed.length > 0 && (
              <p className="text-sm text-stop mt-1">
                {result.failed.length} filas no se pudieron importar (matrícula, nombre o plantel inválido).
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
