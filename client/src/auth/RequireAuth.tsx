import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { ErrorState, Loading } from '../components/ErrorState';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { user, needsSetup, isLoading, error, retry } = useAuth();
  const location = useLocation();

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={retry} />;
  if (needsSetup) return <Navigate to="/configuracion-inicial" replace />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && location.pathname !== '/cambiar-contrasena') {
    return <Navigate to="/cambiar-contrasena" replace />;
  }
  return <Outlet />;
}

export function RequirePm() {
  const { isPm } = useAuth();
  return isPm ? <Outlet /> : <Navigate to="/" replace />;
}

export function HomeRedirect() {
  const { isPm } = useAuth();
  return <Navigate to={isPm ? '/proyectos' : '/mis-tareas'} replace />;
}
