import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LayoutDashboard } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ErrorState, Loading } from '../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../components/FormField';
import { Button, inputClass } from '../components/ui';

function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-4 py-8 sm:px-6">
      <main className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-ink"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><LayoutDashboard size={21} aria-hidden="true" /></span><span className="font-display text-lg font-bold">Gestor PMBOK</span></div>
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-lg sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-2 text-sm leading-6 text-ink-nav">{description}</p>}
          <div className="mt-6">{children}</div>
        </section>
      </main>
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
          <input className={`${inputClass} min-h-11`} type="email" name="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </FormField>
        <div className="relative">
          <FormField label="Contraseña" error={errors.fields.password}>
            <input className={`${inputClass} min-h-11 pr-12`} type={showPassword ? 'text' : 'password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </FormField>
          <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-1 top-6 flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft hover:text-ink">{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
        </div>
        <Button type="submit" className="mt-2 min-h-11 w-full" disabled={busy}>
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
