import { Navigate, Route, Routes } from 'react-router-dom';
import { HomeRedirect, RequireAuth, RequirePm, RequireTaskRunner } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { ChangePasswordPage, LoginPage, SetupPage } from './pages/AuthPages';
import { CalendarPage } from './pages/Calendar';
import { DashboardPage } from './pages/Dashboard';
import { MyTasksPage } from './pages/MyTasks';
import { UsersPage } from './pages/Users';
import { CharterPage } from './pages/project/Charter';
import { ProjectLayout, ProjectSection } from './pages/project/ProjectLayout';
import { ProjectListPage } from './pages/project/ProjectList';
import { ChangeRequestsPage } from './pages/project/ChangeRequests';
import { DeliverablesPage } from './pages/project/Deliverables';
import { ClosurePage } from './pages/project/Closure';
import { StatusReportPage, StatusReportsPage } from './pages/project/StatusReports';
import { MeetingPage, MeetingsPage } from './pages/project/Meetings';
import { LessonsPage } from './pages/project/Lessons';
import { ActivityPage } from './pages/project/Activity';
import { LessonsLibraryPage } from './pages/Lessons';
import { IncidentsPage } from './pages/project/Incidents';
import { PerformancePage } from './pages/project/Performance';
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
          <Route path="/lecciones" element={<LessonsLibraryPage />} />
          <Route path="/proyectos/:id" element={<ProjectLayout />}>
            <Route index element={<Navigate to="resumen" replace />} />
            <Route path="resumen" element={<SummaryPage />} />
            <Route path="acta" element={<CharterPage />} />
            <Route path="tareas" element={<TasksPage />} />
            <Route path="tareas/:taskId" element={<TaskDetailPage />} />
            <Route path="anexos" element={<AttachmentsPage />} />
            <Route path="lecciones" element={<LessonsPage />} />
            <Route element={<ProjectSection section="incidents" />}>
              <Route path="incidentes" element={<IncidentsPage />} />
            </Route>
            <Route element={<ProjectSection section="stakeholders" />}>
              <Route path="interesados" element={<StakeholdersPage />} />
            </Route>
            <Route element={<ProjectSection section="risks" />}>
              <Route path="riesgos" element={<RisksPage />} />
            </Route>
            <Route element={<ProjectSection section="budget" />}>
              <Route path="presupuesto" element={<BudgetPage />} />
            </Route>
            <Route element={<ProjectSection section="performance" />}>
              <Route path="desempeno" element={<PerformancePage />} />
            </Route>
            <Route element={<ProjectSection section="changes" />}>
              <Route path="cambios" element={<ChangeRequestsPage />} />
            </Route>
            <Route element={<ProjectSection section="deliverables" />}>
              <Route path="entregables" element={<DeliverablesPage />} />
            </Route>
            <Route element={<ProjectSection section="activity" />}>
              <Route path="actividad" element={<ActivityPage />} />
            </Route>
            <Route element={<ProjectSection section="closure" />}>
              <Route path="cierre" element={<ClosurePage />} />
            </Route>
            <Route element={<ProjectSection section="reports" />}>
              <Route path="informes" element={<StatusReportsPage />} />
              <Route path="informes/:reportId" element={<StatusReportPage />} />
            </Route>
            <Route element={<ProjectSection section="meetings" />}>
              <Route path="reuniones" element={<MeetingsPage />} />
              <Route path="reuniones/:meetingId" element={<MeetingPage />} />
            </Route>
          </Route>
          <Route path="/calendario" element={<CalendarPage />} />
          <Route element={<RequireTaskRunner />}>
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
