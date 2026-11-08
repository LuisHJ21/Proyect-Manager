import { Navigate, Route, Routes } from 'react-router-dom';
import { HomeRedirect, RequireAuth, RequireCollaborator, RequirePm } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { ChangePasswordPage, LoginPage, SetupPage } from './pages/AuthPages';
import { CalendarPage } from './pages/Calendar';
import { DashboardPage } from './pages/Dashboard';
import { MyTasksPage } from './pages/MyTasks';
import { UsersPage } from './pages/Users';
import { CharterPage } from './pages/project/Charter';
import { ProjectLayout, ProjectPmOnly } from './pages/project/ProjectLayout';
import { ProjectListPage } from './pages/project/ProjectList';
import { ChangeRequestsPage } from './pages/project/ChangeRequests';
import { AttachmentsPage, BudgetPage, RisksPage, StakeholdersPage } from './pages/project/Registers';
import { SummaryPage } from './pages/project/Summary';
import { TaskDetailPage } from './pages/project/TaskDetail';
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
            <Route path="tareas/:taskId" element={<TaskDetailPage />} />
            <Route path="anexos" element={<AttachmentsPage />} />
            <Route element={<ProjectPmOnly />}>
              <Route path="interesados" element={<StakeholdersPage />} />
              <Route path="riesgos" element={<RisksPage />} />
              <Route path="presupuesto" element={<BudgetPage />} />
              <Route path="cambios" element={<ChangeRequestsPage />} />
            </Route>
          </Route>
          <Route path="/calendario" element={<CalendarPage />} />
          <Route element={<RequireCollaborator />}>
            <Route path="/mis-tareas" element={<MyTasksPage />} />
          </Route>
          <Route element={<RequirePm />}>
            <Route path="/panel" element={<DashboardPage />} />
            <Route path="/usuarios" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
