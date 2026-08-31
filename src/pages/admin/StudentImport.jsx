import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Link, useNavigate } from 'react-router-dom';
import { Schools, Students } from '../../firebase/services';

// Columnas esperadas en el CSV: matricula, name, school, address, parentContact
const REQUIRED_COLUMNS = ['matricula', 'name', 'school'];

export default function StudentImport() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileError, setFileError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => Schools.subscribe(setSchools), []);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileError('');
    setResult(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const cols = res.meta.fields || [];
        const missing = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
        if (missing.length) {
          setFileError(`Faltan columnas en el CSV: ${missing.join(', ')}`);
          setRows([]);
          return;
        }
        setRows(res.data);
      },
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
    let ok = 0;
    let failed = [];
    for (const row of rows) {
      const schoolId = schoolIdFor(row.school);
      if (!row.matricula || !row.name || !schoolId) {
        failed.push(row);
        continue;
      }
      await Students.create({
        matricula: String(row.matricula).trim(),
        name: row.name.trim(),
        schoolId,
        address: row.address || '',
        parentContact: row.parentcontact || row.parentContact || '',
        routeId: '',
      });
      ok += 1;
    }
    setImporting(false);
    setResult({ ok, failed });
  }

  return (
    <div className="max-w-2xl">
      <Link to="/admin/alumnos" className="text-navy-400 text-sm underline">← Volver a alumnos</Link>
      <h1 className="text-2xl font-display font-bold text-navy-900 mt-2 mb-2">Cargar alumnos por CSV</h1>
      <p className="text-navy-400 text-sm mb-6">
        El archivo debe tener columnas: <code className="bg-navy-100 px-1 rounded">matricula</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">name</code>,{' '}
        <code className="bg-navy-100 px-1 rounded">school</code> (nombre exacto del plantel ya dado de alta),
        y opcionalmente <code className="bg-navy-100 px-1 rounded">address</code> y{' '}
        <code className="bg-navy-100 px-1 rounded">parentContact</code>.
      </p>

      <div className="card space-y-4">
        <input type="file" accept=".csv" onChange={handleFile} />
        {fileError && <p className="text-stop text-sm">{fileError}</p>}

        {rows.length > 0 && !result && (
          <>
            <p className="text-sm text-navy-600">{rows.length} filas detectadas. Vista previa:</p>
            <div className="overflow-x-auto max-h-64 border border-navy-100 rounded-xl">
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
              className="px-4 py-2 rounded-xl bg-go text-white font-semibold"
            >
              {importing ? 'Importando…' : `Importar ${rows.length} alumnos`}
            </button>
          </>
        )}

        {result && (
          <div className="bg-go-light border-2 border-go rounded-xl p-4">
            <p className="font-medium">Se importaron {result.ok} alumnos correctamente.</p>
            {result.failed.length > 0 && (
              <p className="text-sm text-stop mt-1">
                {result.failed.length} filas no se pudieron importar (matrícula, nombre o plantel inválido).
              </p>
            )}
            <button onClick={() => navigate('/admin/alumnos')} className="mt-3 underline text-sm">
              Ver lista de alumnos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
