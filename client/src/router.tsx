import { Navigate, Route, Routes } from 'react-router-dom';
import { HomeRedirect, RequireAuth, RequirePm } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { ChangePasswordPage, LoginPage, SetupPage } from './pages/AuthPages';
import { MyTasksPage } from './pages/MyTasks';
import { UsersPage } from './pages/Users';
import { CharterPage } from './pages/project/Charter';
import { ProjectLayout, ProjectPmOnly } from './pages/project/ProjectLayout';
import { ProjectListPage } from './pages/project/ProjectList';
import { SummaryPage } from './pages/project/Summary';
import { TasksPage } from './pages/project/Tasks';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/configuracion-inicial" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/cambiar-contrasena" element={<ChangePasswordPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="/proyectos" element={<ProjectListPage />} />
          <Route path="/proyectos/:id" element={<ProjectLayout />}>
            <Route index element={<Navigate to="resumen" replace />} />
            <Route path="resumen" element={<SummaryPage />} />
            <Route path="acta" element={<CharterPage />} />
            <Route path="tareas" element={<TasksPage />} />
            <Route element={<ProjectPmOnly />}>
              <Route path="interesados" element={null} />
              <Route path="riesgos" element={null} />
              <Route path="presupuesto" element={null} />
            </Route>
          </Route>
          <Route path="/mis-tareas" element={<MyTasksPage />} />
          <Route element={<RequirePm />}>
            <Route path="/usuarios" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
