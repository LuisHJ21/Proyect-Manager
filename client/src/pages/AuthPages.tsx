import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ErrorState, Loading } from '../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../components/FormField';
import { Button, inputClass } from '../components/ui';

function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-raised p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-sm">
        <p className="mb-1 text-sm font-bold text-link">Gestor de proyectos</p>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-nav">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function useSubmit<T>(run: () => Promise<T>, onDone: (result: T) => void) {
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      onDone(await run());
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };
  return { errors, busy, submit };
}

export function SetupPage() {
  const { needsSetup, requiresToken, isLoading, signedIn } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { errors, busy, submit } = useSubmit(
    () => api<User>('/api/setup', { method: 'POST', body: { name, email, password, ...(requiresToken ? { token } : {}) } }),
    (user) => {
      signedIn(user);
      navigate('/', { replace: true });
    },
  );

  if (isLoading) return <Loading />;
  if (!needsSetup) return <Navigate to="/" replace />;

  return (
    <AuthCard title="Configuración inicial" description="Crea tu cuenta de Project Manager para empezar.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        {requiresToken && (
          <FormField label="Código de configuración" error={errors.fields.token} hint="Lo encuentras en la variable SETUP_TOKEN del servidor">
            <input className={inputClass} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </FormField>
        )}
        <FormField label="Nombre" error={errors.fields.name}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </FormField>
        <FormField label="Correo" error={errors.fields.email}>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </FormField>
        <FormField label="Contraseña" error={errors.fields.password} hint="Al menos 10 caracteres">
          <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </FormField>
        <Button type="submit" className="w-full" disabled={busy}>
          Crear cuenta
        </Button>
      </form>
    </AuthCard>
  );
}

export function LoginPage() {
  const { user, needsSetup, isLoading, error, retry, signedIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { errors, busy, submit } = useSubmit(
    () => api<User>('/api/auth/login', { method: 'POST', body: { email, password } }),
    (loggedIn) => {
      signedIn(loggedIn);
      navigate('/', { replace: true });
    },
  );

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={retry} />;
  if (needsSetup) return <Navigate to="/configuracion-inicial" replace />;
  if (user) return <Navigate to="/" replace />;

  return (
    <AuthCard title="Iniciar sesión">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Correo" error={errors.fields.email}>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </FormField>
        <FormField label="Contraseña" error={errors.fields.password}>
          <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </FormField>
        <Button type="submit" className="w-full" disabled={busy}>
          Iniciar sesión
        </Button>
      </form>
    </AuthCard>
  );
}

export function ChangePasswordPage() {
  const { user, signedIn } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { errors, busy, submit } = useSubmit(
    () => api<User>('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
    (updated) => {
      signedIn(updated);
      navigate('/', { replace: true });
    },
  );

  return (
    <AuthCard
      title="Cambiar contraseña"
      description={user?.mustChangePassword ? 'Debes cambiar tu contraseña temporal antes de continuar.' : undefined}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Contraseña actual" error={errors.fields.currentPassword}>
          <input className={inputClass} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        </FormField>
        <FormField label="Contraseña nueva" error={errors.fields.newPassword} hint="Al menos 10 caracteres">
          <input className={inputClass} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        </FormField>
        <Button type="submit" className="w-full" disabled={busy}>
          Cambiar contraseña
        </Button>
        {!user?.mustChangePassword && (
          <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
            Volver
          </Button>
        )}
      </form>
    </AuthCard>
  );
}
