import { LABELS } from "@pm/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  FolderKanban,
  House,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MonitorActivity,
  MoreHorizontal,
  Plus,
  Users,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Project, Task } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { projectColor } from "../lib/display";
import { useIsMobile } from "../lib/useIsMobile";
import { NotificationBell } from "./NotificationBell";
import { ProjectForm } from "./project/ProjectForm";
import { Avatar, Button } from "./ui";

type Destination = {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
};

const PM_LINKS: Destination[] = [
  { to: "/panel", label: "Inicio", Icon: House },
  { to: "/mis-tareas", label: "Mis tareas", Icon: CheckSquare },
  { to: "/calendario", label: "Calendario", Icon: CalendarDays },
  { to: "/lecciones", label: "Lecciones", Icon: Lightbulb },
  { to: "/proyectos", label: "Proyectos", Icon: FolderKanban },
  { to: "/usuarios", label: "Usuarios", Icon: Users },
];

const COLLABORATOR_LINKS: Destination[] = [
  { to: "/mis-tareas", label: "Mis tareas", Icon: CheckSquare },
  { to: "/calendario", label: "Calendario", Icon: CalendarDays },
  { to: "/lecciones", label: "Lecciones", Icon: Lightbulb },
  { to: "/proyectos", label: "Proyectos", Icon: FolderKanban },
];

/** El observador solo consulta: sin Mis tareas. */
const OBSERVER_LINKS: Destination[] = [
  { to: "/proyectos", label: "Proyectos", Icon: FolderKanban },
  { to: "/calendario", label: "Calendario", Icon: CalendarDays },
  { to: "/lecciones", label: "Lecciones", Icon: Lightbulb },
];

const ACTIVE = new Set(["PLANNING", "EXECUTING", "PAUSED"]);

const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 ${isActive ? "bg-active font-semibold text-link" : "text-ink-nav hover:bg-raised"}`;

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1.5 text-ink">
      {/* <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
        <LayoutDashboard size={18} aria-hidden="true" />
      </span> */}
      <span className="font-bold text-2xl tracking-tighter">
        JL
        <span className="text-[#75ddc9]">.</span>
      </span>

      <span>|</span>
      {/* <MonitorActivity size={50} aria-hidden="true" />
      <span className="max-[380px]:hidden font-display text-lg font-bold">
        PM-JL
      </span> */}
      <span className="max-[380px]:hidden font-display text-lg font-bold">
        PMCORE
      </span>
    </Link>
  );
}

function useOpenTaskCount(): number {
  const tasks = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => api<Task[]>("/api/me/tasks"),
  });
  return tasks.data?.filter((t) => t.status !== "DONE").length ?? 0;
}

function AccountActions() {
  const { logout } = useAuth();
  return (
    <>
      <NavLink
        to="/cambiar-contrasena"
        className="flex min-h-8 items-center gap-2 rounded-md px-1 text-xs text-ink-soft hover:text-ink"
      >
        <KeyRound size={14} aria-hidden="true" />
        Cambiar mi contraseña
      </NavLink>
      <button
        type="button"
        onClick={() => void logout()}
        className="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-1 text-left text-xs text-ink-soft hover:text-ink"
      >
        <LogOut size={14} aria-hidden="true" />
        Cerrar sesión
      </button>
    </>
  );
}

function Sidebar({
  links,
  openTasks,
  projects,
  showBell,
}: {
  links: Destination[];
  openTasks: number;
  projects: Project[];
  showBell: boolean;
}) {
  const { user } = useAuth();
  const [projectSearch, setProjectSearch] = useState("");
  const visibleProjects = projects.filter((project) =>
    project.name
      .toLocaleLowerCase()
      .includes(projectSearch.trim().toLocaleLowerCase()),
  );
  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-4 border-r border-line bg-sidebar px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <Brand />
        {showBell && <NotificationBell />}
      </div>
      <nav
        aria-label="Principal"
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <div className="space-y-0.5">
          {links.map(({ to, label, Icon }) => {
            const isMyTasks = to === "/mis-tareas";
            return (
              <NavLink
                key={to}
                to={to}
                className={sideLink}
                aria-label={
                  isMyTasks ? `${label}, ${openTasks} abiertas` : undefined
                }
              >
                <Icon size={18} aria-hidden="true" />
                {label}
                {isMyTasks && (
                  <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-ink-nav">
                    {openTasks}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-3 pb-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            <span>Proyectos activos</span>
            <span aria-label={`${projects.length} proyectos activos`}>
              {projects.length}
            </span>
          </div>
          {projects.length > 8 && (
            <input
              type="search"
              aria-label="Buscar proyecto activo"
              placeholder="Buscar proyecto…"
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              className="mb-2 w-full rounded-lg border border-control bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
          )}
          <div
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-1"
            role="group"
            aria-label="Lista de proyectos activos"
          >
            {visibleProjects.map((project) => (
              <NavLink
                key={project.id}
                to={`/proyectos/${project.id}/resumen`}
                className={({ isActive }) =>
                  `${sideLink({ isActive })} !min-h-9`
                }
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: projectColor(project.id) }}
                  aria-hidden="true"
                />
                <span className="truncate">{project.name}</span>
              </NavLink>
            ))}
            {visibleProjects.length === 0 && (
              <p className="px-3 py-2 text-sm text-ink-soft">
                No hay proyectos coincidentes.
              </p>
            )}
          </div>
        </div>
      </nav>
      <details className="group relative shrink-0 border-t border-line pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 hover:bg-raised focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          {user && <Avatar name={user.name} size="lg" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {user?.name}
            </p>
            <p className="text-xs text-ink-soft">
              {user && LABELS.role[user.role]}
            </p>
          </div>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="shrink-0 text-ink-soft transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="absolute inset-x-0 bottom-full z-20 mb-2 rounded-xl border border-line bg-surface p-3 shadow-lg">
          <AccountActions />
        </div>
      </details>
    </aside>
  );
}

/** Dentro de un proyecto: solo iconos, para dejar sitio al menú del proyecto. */
function CompactSidebar({
  links,
  openTasks,
  showBell,
}: {
  links: Destination[];
  openTasks: number;
  showBell: boolean;
}) {
  const { logout } = useAuth();
  const railLink = ({ isActive }: { isActive: boolean }) =>
    `relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-150 ${isActive ? "bg-active text-link" : "text-ink-nav hover:bg-raised"}`;
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col items-center gap-4 border-r border-line bg-sidebar py-5">
      <Link
        to="/"
        aria-label="Gestor PMBOK"
        title="Gestor PMBOK"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white"
      >
        <LayoutDashboard size={18} aria-hidden="true" />
      </Link>
      <nav
        aria-label="Principal"
        className="flex flex-1 flex-col items-center gap-1"
      >
        {links.map(({ to, label, Icon }) => {
          const name =
            to === "/mis-tareas" ? `${label}, ${openTasks} abiertas` : label;
          return (
            <NavLink
              key={to}
              to={to}
              className={railLink}
              aria-label={name}
              title={name}
            >
              <Icon size={20} aria-hidden="true" />
              {to === "/mis-tareas" && openTasks > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-white"
                >
                  {openTasks}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-1">
        {showBell && <NotificationBell />}
        <NavLink
          to="/cambiar-contrasena"
          aria-label="Cambiar mi contraseña"
          title="Cambiar mi contraseña"
          className={railLink}
        >
          <KeyRound size={18} aria-hidden="true" />
        </NavLink>
        <button
          type="button"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          onClick={() => void logout()}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-ink-nav hover:bg-raised"
        >
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function MobileNav({
  links,
  openTasks,
}: {
  links: Destination[];
  openTasks: number;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = links.filter((link) =>
    ["/panel", "/proyectos", "/mis-tareas", "/calendario"].includes(link.to),
  );
  const more = links.filter((link) => !primary.includes(link));
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-sidebar"
    >
      {moreOpen && (
        <div className="absolute inset-x-0 bottom-full border-t border-line bg-sidebar p-3 shadow-lg">
          <p className="mb-2 px-2 text-xs font-semibold text-ink-soft">
            Más secciones
          </p>
          {more.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-ink-nav hover:bg-raised"
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${primary.length + (more.length ? 1 : 0)}, minmax(0, 1fr))`,
        }}
      >
        {primary.map(({ to, label, Icon }) => {
          const isMyTasks = to === "/mis-tareas";
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              aria-label={
                isMyTasks ? `${label}, ${openTasks} abiertas` : undefined
              }
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? "text-link" : "text-ink-soft"}`
              }
            >
              <Icon size={20} aria-hidden="true" />
              <span className="min-w-0 max-w-full truncate px-0.5">
                {label}
              </span>
            </NavLink>
          );
        })}
        {more.length > 0 && (
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-label="Más secciones"
            onClick={() => setMoreOpen((open) => !open)}
            className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-soft"
          >
            <MoreHorizontal size={20} aria-hidden="true" />
            <span>Más</span>
          </button>
        )}
      </div>
    </nav>
  );
}

export function AppLayout() {
  const { user, isPm, logout } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Dentro de un proyecto el menú general se compacta y la franja de «Nuevo proyecto» se oculta.
  const inProject = useMatch("/proyectos/:id/*") !== null;

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/api/projects"),
  });
  const openTasks = useOpenTaskCount();
  const links = isPm
    ? PM_LINKS
    : user?.role === "OBSERVER"
      ? OBSERVER_LINKS
      : COLLABORATOR_LINKS;
  const activeProjects =
    projects.data?.filter((p) => ACTIVE.has(p.status)) ?? [];
  // El observador no puede recibir avisos: no se le asigna nada ni comenta.
  const showBell = user?.role !== "OBSERVER";

  return (
    <div className="flex min-h-screen bg-page">
      {!isMobile &&
        (inProject ? (
          <CompactSidebar
            links={links}
            openTasks={openTasks}
            showBell={showBell}
          />
        ) : (
          <Sidebar
            links={links}
            openTasks={openTasks}
            projects={activeProjects}
            showBell={showBell}
          />
        ))}
      <div className="flex min-w-0 flex-1 flex-col">
        {isMobile && (
          <header className="flex min-w-0 items-center justify-between gap-2 border-b border-line bg-sidebar px-3 py-3 sm:px-4">
            <Brand />
            <div className="flex shrink-0 items-center gap-1">
              {showBell && <NotificationBell />}
              {user && <Avatar name={user.name} />}
              <NavLink
                to="/cambiar-contrasena"
                aria-label="Cambiar mi contraseña"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-nav hover:bg-raised"
              >
                <KeyRound size={18} aria-hidden="true" />
              </NavLink>
              <button
                type="button"
                aria-label="Cerrar sesión"
                onClick={() => void logout()}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-ink-nav hover:bg-raised"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          </header>
        )}
        {isPm && !inProject && (
          <div className="flex justify-end border-b border-line px-4 py-3 md:px-8">
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" />
              Nuevo proyecto
            </Button>
          </div>
        )}
        <main
          className={`min-w-0 flex-1 p-4 md:p-8 ${isMobile ? "pb-24" : ""}`}
        >
          <Outlet />
        </main>
      </div>
      {isMobile && <MobileNav links={links} openTasks={openTasks} />}
      {creating && (
        <ProjectForm
          onClose={() => setCreating(false)}
          onSaved={(project) => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            navigate(`/proyectos/${project.id}/resumen`);
          }}
        />
      )}
    </div>
  );
}
