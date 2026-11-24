import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, FolderKanban, LayoutDashboard, ListChecks, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ErrorState, Loading } from '../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../components/FormField';
import { Button, inputClass } from '../components/ui';

function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-page lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.9fr)]">
      <section aria-label="Presentación" className="relative hidden min-w-0 flex-col justify-between overflow-hidden border-r border-line bg-sidebar p-10 lg:flex xl:p-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3 text-ink"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white"><LayoutDashboard size={24} aria-hidden="true" /></span><span className="font-display text-xl font-bold">Gestor PMBOK</span></div>
        <div className="relative max-w-xl">
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-link uppercase">Gestión de proyectos</p>
          <h2 className="font-display text-4xl leading-tight font-semibold text-ink xl:text-5xl">Del plan al resultado, con todo el proyecto a la vista.</h2>
          <p className="mt-5 max-w-md text-base leading-7 text-ink-nav">Organiza el trabajo, sigue los hitos y mantén al equipo alineado desde un mismo espacio.</p>
          <div className="mt-10 grid max-w-md gap-3 text-sm text-ink-nav">
            <p className="flex items-center gap-3"><FolderKanban size={18} className="text-link" aria-hidden="true" /> Estructura del trabajo y cronograma</p>
            <p className="flex items-center gap-3"><ListChecks size={18} className="text-link" aria-hidden="true" /> Tareas, entregables y seguimiento</p>
            <p className="flex items-center gap-3"><ShieldCheck size={18} className="text-link" aria-hidden="true" /> Riesgos, cambios e informes</p>
          </div>
        </div>
        <p className="relative text-xs text-ink-soft">Tu espacio para planificar y dar seguimiento.</p>
      </section>
      <div className="flex min-w-0 items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><LayoutDashboard size={21} aria-hidden="true" /></span><span className="font-display text-lg font-bold text-ink">Gestor PMBOK</span></div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-link uppercase">Bienvenido</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-nav">{description ?? 'Accede a tu espacio de proyectos.'}</p>
          <div className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-lg sm:p-8">{children}</div>
          <p className="mt-6 text-center text-xs text-ink-soft">Acceso para miembros de tu organización.</p>
        </div>
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
  const [showPassword, setShowPassword] = useState(false);
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
          <input className={inputClass} type="email" name="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </FormField>
        <div className="relative">
          <FormField label="Contraseña" error={errors.fields.password}>
            <input className={`${inputClass} pr-12`} type={showPassword ? 'text' : 'password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </FormField>
          <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-1 top-6 flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft hover:text-ink">{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
        </div>
        <Button type="submit" className="mt-2 w-full" disabled={busy}>
          {busy ? 'Ingresando…' : 'Iniciar sesión'}
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
