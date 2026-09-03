import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { School, Users, Contact, Truck, Route as RouteIcon } from 'lucide-react';
import { Schools, Students, Drivers, Units, Routes } from '../../firebase/services';

export default function Dashboard() {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    async function load() {
      const [schools, students, drivers, units, routes] = await Promise.all([
        Schools.list(),
        Students.list(),
        Drivers.list(),
        Units.list(),
        Routes.list(),
      ]);
      setCounts({
        schools: schools.length,
        students: students.length,
        drivers: drivers.length,
        units: units.length,
        routes: routes.length,
      });
    }
    load();
  }, []);

  const cards = [
    { label: 'Planteles', value: counts?.schools, to: '/admin/planteles', icon: School },
    { label: 'Alumnos', value: counts?.students, to: '/admin/alumnos', icon: Users },
    { label: 'Choferes y nannies', value: counts?.drivers, to: '/admin/choferes', icon: Contact },
    { label: 'Unidades', value: counts?.units, to: '/admin/unidades', icon: Truck },
    { label: 'Rutas', value: counts?.routes, to: '/admin/rutas', icon: RouteIcon },
  ];

  return (
    <div>
      <h1 className="admin-h1 mb-5">Resumen</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="admin-card hover:border-navy-400 transition-colors"
          >
            <c.icon size={18} className="text-navy-400 mb-3" />
            <p className="text-2xl font-display font-bold text-navy-800">{c.value ?? '—'}</p>
            <p className="text-navy-400 text-xs mt-0.5">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="admin-card mt-5 max-w-2xl">
        <p className="font-display font-semibold text-sm text-navy-800 mb-2">Primeros pasos</p>
        <ol className="list-decimal list-inside text-sm text-navy-600 space-y-1.5">
          <li>Da de alta los planteles (colegios).</li>
          <li>Carga la lista de alumnos (manual o por CSV) con su matrícula, plantel y domicilio.</li>
          <li>Registra las unidades (camionetas/camiones) disponibles.</li>
          <li>Da de alta a los choferes y nannies, con su correo para poder iniciar sesión.</li>
          <li>Crea las rutas: asigna plantel, chofer, nanny, unidad y alumnos.</li>
        </ol>
      </div>
    </div>
  );
}
