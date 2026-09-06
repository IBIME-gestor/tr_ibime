import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Link, useNavigate } from 'react-router-dom';
import { Students, Routes } from '../../firebase/services';

// Columnas esperadas: matricula, route (nombre EXACTO de la ruta ya creada
// en /admin/rutas). Acepta .csv, .xlsx, .xls, o pegar texto plano
// "matricula,route" una fila por línea, sin subir archivo.
const REQUIRED_COLUMNS = ['matricula', 'route'];

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase();
}

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

export default function RouteAssignImport() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [students, setStudents] = useState([]);
  const [pasteText, setPasteText] = useState('');
  const [rows, setRows] = useState([]);
  const [fileError, setFileError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => Routes.subscribe(setRoutes), []);
  useEffect(() => Students.subscribe(setStudents), []);

  const studentByMatricula = useMemo(() => {
    const map = new Map();
    students.forEach((s) => map.set(String(s.matricula).trim(), s));
    return map;
  }, [students]);

  function routeIdFor(name) {
    const match = routes.find(
      (r) => r.name.trim().toLowerCase() === (name || '').trim().toLowerCase()
    );
    return match?.id || null;
  }

  function parseRows(data) {
    setResult(null);
    setRows(data.map((r) => ({ matricula: String(r.matricula || '').trim(), route: (r.route || '').trim() })));
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileError('');

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isExcel) {
      parseExcelFile(file)
        .then((data) => {
          const cols = Object.keys(data[0] || {});
          const missing = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
          if (missing.length) {
            setFileError(`Faltan columnas en el archivo: ${missing.join(', ')}`);
            setRows([]);
            return;
          }
          parseRows(data);
        })
        .catch(() => setFileError('No se pudo leer el archivo de Excel. Verifica que no esté dañado o protegido.'));
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (res) => {
        const cols = res.meta.fields || [];
        const missing = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
        if (missing.length) {
          setFileError(`Faltan columnas en el CSV: ${missing.join(', ')}`);
          setRows([]);
          return;
        }
        parseRows(res.data);
      },
      error: () => setFileError('No se pudo leer el archivo.'),
    });
  }

  function handleParsePaste() {
    setFileError('');
    // Acepta líneas "matricula,route" o "matricula route" (separadas por
    // coma, tab o varios espacios). Ignora líneas vacías.
    const data = pasteText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,;\t]| {2,}/).map((p) => p.trim()).filter(Boolean);
        return { matricula: parts[0] || '', route: parts.slice(1).join(' ') || '' };
      });
    if (data.length === 0) {
      setFileError('Pega al menos una línea con "matrícula, nombre de ruta".');
      return;
    }
    parseRows(data);
  }

  // Preview: cruza cada fila contra alumnos y rutas reales.
  const preview = useMemo(() => {
    return rows.map((row) => {
      const student = studentByMatricula.get(row.matricula);
      const routeId = routeIdFor(row.route);
      let error = null;
      if (!student) error = 'Matrícula no encontrada';
      else if (!routeId) error = 'Ruta no encontrada (revisa el nombre exacto)';
      return { ...row, student, routeId, error };
    });
  }, [rows, studentByMatricula, routes]);

  const okRows = preview.filter((r) => !r.error);
  const errorRows = preview.filter((r) => r.error);

  async function handleImport() {
    setImporting(true);
    const items = okRows.map((r) => ({
      id: r.student.id,
      matricula: r.student.matricula,
      name: r.student.name,
      routeId: r.routeId,
    }));
    await Students.bulkAssignRoute(items);
    setImporting(false);
    setResult({ ok: items.length, failed: errorRows.length });
    setRows([]);
  }

  return (
    <div className="max-w-2xl">
      <Link to="/admin/alumnos" className="link-action">← Volver a alumnos</Link>
      <h1 className="admin-h1 mt-2 mb-2">Asignar ruta por matrícula (lote)</h1>
      <p className="text-navy-400 text-sm mb-5">
        Para asignar muchos alumnos a su ruta sin hacerlo de uno en uno. Sube un CSV con columnas{' '}
        <code className="bg-navy-100 px-1 rounded">matricula</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">route</code> (nombre exacto de la ruta), o pega
        el listado directo abajo.
      </p>

      <div className="admin-card space-y-4">
        <div>
          <label className="admin-label">Opción A: subir CSV o Excel</label>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="text-sm" />
        </div>

        <div className="border-t border-navy-100 pt-4">
          <label className="admin-label">Opción B: pegar lista (una fila por línea: matrícula, ruta)</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'A1023, Ruta Norte 1\nA1044, Ruta Norte 1\nA1050, Ruta Sur 2'}
            rows={6}
            className="admin-input font-mono text-xs"
          />
          <button onClick={handleParsePaste} className="btn-admin-ghost mt-2">
            Procesar lista pegada
          </button>
        </div>

        {fileError && <p className="text-stop text-sm">{fileError}</p>}

        {rows.length > 0 && !result && (
          <>
            <p className="text-sm text-navy-600">
              {preview.length} filas · <span className="text-go font-medium">{okRows.length} listas para asignar</span>
              {errorRows.length > 0 && (
                <span className="text-stop font-medium"> · {errorRows.length} con error</span>
              )}
            </p>
            <div className="overflow-x-auto max-h-72 border border-navy-100 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left bg-navy-50">
                    <th className="p-2">Matrícula</th>
                    <th className="p-2">Alumno</th>
                    <th className="p-2">Ruta destino</th>
                    <th className="p-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-t border-navy-50">
                      <td className="p-2">{r.matricula}</td>
                      <td className="p-2">{r.student?.name || '—'}</td>
                      <td className="p-2">{r.route}</td>
                      <td className="p-2">
                        {r.error ? (
                          <span className="text-stop">{r.error}</span>
                        ) : (
                          <span className="text-go">✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleImport}
              disabled={importing || okRows.length === 0}
              className="btn-admin bg-go text-white hover:bg-go/90"
            >
              {importing ? 'Asignando…' : `Asignar ${okRows.length} alumnos a su ruta`}
            </button>
          </>
        )}

        {result && (
          <div className="bg-go-light border border-go rounded-lg p-4">
            <p className="font-medium text-sm text-navy-800">
              Se asignaron {result.ok} alumnos a su ruta correctamente.
            </p>
            {result.failed > 0 && (
              <p className="text-sm text-stop mt-1">
                {result.failed} filas no se pudieron asignar (revisa matrícula o nombre de ruta).
              </p>
            )}
            <button onClick={() => navigate('/admin/rutas')} className="link-action mt-3">
              Ver rutas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
