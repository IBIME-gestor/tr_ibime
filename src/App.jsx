import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';
import DriverLayout from './components/layout/DriverLayout';

import Login from './pages/Login';

import Dashboard from './pages/admin/Dashboard';
import Schools from './pages/admin/Schools';
import Students from './pages/admin/Students';
import StudentImport from './pages/admin/StudentImport';
import DriversAdmin from './pages/admin/Drivers';
import Units from './pages/admin/Units';
import RoutesAdmin from './pages/admin/Routes';
import Reports from './pages/admin/Reports';

import RouteHome from './pages/driver/RouteHome';
import TripRunner from './pages/driver/TripRunner';
import TripSummary from './pages/driver/TripSummary';
import TripHistory from './pages/driver/TripHistory';
import ReferenceRoute from './pages/driver/ReferenceRoute';

import PublicTrack from './pages/PublicTrack';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="planteles" element={<Schools />} />
        <Route path="alumnos" element={<Students />} />
        <Route path="alumnos/importar" element={<StudentImport />} />
        <Route path="choferes" element={<DriversAdmin />} />
        <Route path="unidades" element={<Units />} />
        <Route path="rutas" element={<RoutesAdmin />} />
        <Route path="reportes" element={<Reports />} />
      </Route>

      <Route
        path="/chofer"
        element={
          <ProtectedRoute role={['driver', 'nanny']}>
            <DriverLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RouteHome />} />
        <Route path="recorrido/:routeId/:shift" element={<TripRunner />} />
        <Route path="resumen/:tripId" element={<TripSummary />} />
        <Route path="historial" element={<TripHistory />} />
        <Route path="referencia/:routeId/:shift" element={<ReferenceRoute />} />
      </Route>

      {/* Seguimiento para el padre de familia: sin login, solo con matrícula. */}
      <Route path="/seguimiento" element={<PublicTrack />} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
