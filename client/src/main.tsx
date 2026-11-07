import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="p-8 text-slate-800">Gestor de proyectos</main>
  </StrictMode>,
);
