import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Link, useNavigate } from 'react-router-dom';
import { Schools, Students } from '../../firebase/services';

// Columnas esperadas: matricula, name, school, address, parentContact
// Funciona tanto con .csv como con .xlsx/.xls reales de Excel.
const REQUIRED_COLUMNS = ['matricula', 'name', 'school'];

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase();
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

  useEffect(() => Schools.subscribe(setSchools), []);

  function applyRows(cols, data) {
    const missing = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
    if (missing.length) {
      setFileError(`Faltan columnas en el archivo: ${missing.join(', ')}`);
      setRows([]);
      return;
    }
    setRows(data);
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
        name: row.name.trim(),
        schoolId,
        address: row.address || '',
        parentContact: row.parentcontact || row.parentContact || '',
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
        <code className="bg-navy-100 px-1 rounded">school</code> (nombre exacto del plantel ya dado de alta),
        y opcionalmente <code className="bg-navy-100 px-1 rounded">address</code> y{' '}
        <code className="bg-navy-100 px-1 rounded">parentContact</code>.
      </p>

      <div className="admin-card space-y-4">
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="text-sm" />
        {fileError && <p className="text-stop text-sm">{fileError}</p>}

        {rows.length > 0 && !result && (
          <>
            <p className="text-sm text-navy-600">{rows.length} filas detectadas. Vista previa:</p>
            <div className="overflow-x-auto max-h-64 border border-navy-100 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left bg-navy-50">
                    <th className="p-2">Matrícula</th>
                    <th className="p-2">Nombre</th>
                    <th className="p-2">Plantel</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-navy-50">
                      <td className="p-2">{r.matricula}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">
                        {schoolIdFor(r.school) ? r.school : <span className="text-stop">{r.school} (no existe)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleImport}
              disabled={importing}
              className="btn-admin bg-go text-white hover:bg-go/90"
            >
              {importing ? 'Importando…' : `Importar ${rows.length} alumnos`}
            </button>
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
