import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { initErrorLog } from './utils/errorLog';
import './index.css';

// Registro de errores de usuarios (se ve en Admin → Soporte → Errores).
initErrorLog();

// Dentro del router para reiniciarse al cambiar de pantalla.
function Guarded({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Guarded>
          <App />
        </Guarded>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
