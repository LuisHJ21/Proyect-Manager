import type {
  ActivityAction,
  ActivityChange,
  ActivityEntity,
  Approach,
  NotificationKind,
  CharterStatus,
  ExpenseCategory,
  Health,
  Level,
  MilestoneStatus,
  ObjectiveStatus,
  Priority,
  ProjectStatus,
  Role,
  RiskStatus,
  RiskType,
  TaskStatus,
} from '@pm/shared';

export type User = { id: string; name: string; email: string; role: Role; active: boolean; mustChangePassword: boolean };
export type PersonRef = { id: string; name: string };
export type UserOverview = User & { projects: { id: string; name: string; projectRole: string }[]; openTasks: number; overdueTasks: number };
export type UserTask = { id: string; title: string; status: TaskStatus; dueDate: string | null; projectId: string; projectName: string };
export type CalendarTask = { id: string; title: string; dueDate: string; status: TaskStatus; projectId: string; projectName: string; assignees: PersonRef[] };
export type CalendarMilestone = { id: string; name: string; dueDate: string; status: MilestoneStatus; projectId: string; projectName: string };
export type CalendarData = {
  tasks: CalendarTask[];
  milestones: CalendarMilestone[];
  undated: { id: string; title: string; status: TaskStatus; projectId: string; projectName: string }[];
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  approach: Approach;
  startDate: string | null;
  endDate: string | null;
  /** Fecha del cierre vigente; null si está abierto o se cerró antes del registro de cierres. */
  closedAt?: string | null;
  progress?: number;
  team?: PersonRef[];
  /** Solo para Project Manager. */
  plannedBudgetCents?: number;
  /** Solo llegan al Project Manager. */
  contingencyReserveCents?: number;
  managementReserveCents?: number;
  currency?: string;
  /** Umbrales de salud: solo llegan al PM. */
  healthOverdueTasks?: number;
  healthBudgetPercent?: number;
  healthIndexMin?: number;
  highRiskScore?: number;
  statusReportFrequency?: import('@pm/shared').StatusReportFrequency;
  /** C13: si sus lecciones aparecen en la biblioteca para quien no es miembro. */
  shareLessons?: boolean;
  /** Pausa abierta (etapa 8); el prioritario llega solo si quien ve es PM o miembro de ese proyecto. */
  activePause?: { pausedOn: string | null; reason: string; priorityProject: PersonRef | null } | null;
  health?: Health | null;
  overdueTasks?: number;
  highRisks?: number;
  spentCents?: number;
};

/** Contenido congelado del acta en una aprobación (F18). */
export type CharterVersionContent = Partial<Record<'sponsor' | 'justification' | 'scopeIncluded' | 'scopeExcluded' | 'boundaries' | 'assumptions' | 'constraints' | 'successCriteria', string>> & {
  objectives?: { description: string; metric: string; target: string; status: string }[];
  milestones?: { name: string; dueDate: string; status: string }[];
};
export type CharterVersionSummary = { number: number; approvedAt: string; approvedBy: PersonRef | null };
export type CharterVersionDetail = CharterVersionSummary & { content: CharterVersionContent };

export type PauseImpact = { shared: { userId: string; name: string; hours: { projectId: string; total: number }[] }[] };
type Dates = { startDate: string | null; dueDate: string | null };
export type ResumePreview = {
  proposedDays: number;
  days: number;
  hasBaseline: boolean;
  /** Por qué no se puede crear la nueva línea base; null si se puede. */
  baselineProblem?: string | null;
  changes: {
    tasks: { id: string; name: string; from: Dates; to: Dates }[];
    milestones: { id: string; name: string; from: string; to: string }[];
    endDate: { from: string; to: string } | null;
  };
};
export type ProjectPauseEntry = { pausedOn: string | null; resumedOn: string | null; reason: string; shiftDays: number | null; priorityProject: PersonRef | null };

export type Dashboard = {
  totals: { activeProjects: number; atRiskProjects: number; overdueTasks: number; overdueProjects: number; highRisks: number; overBudgetProjects: number };
  projects: { id: string; name: string; progress: number; endDate: string | null; health: Health | null; team: PersonRef[] }[];
  attention: (
    | { kind: 'task'; id: string; title: string; projectId: string; projectName: string; dueDate: string; score?: undefined }
    | { kind: 'risk'; id: string; title: string; projectId: string; projectName: string; score: number; dueDate?: undefined }
    | { kind: 'incident'; id: string; number: number; title: string; projectId: string; projectName: string; priority: Priority; dueDate: string | null; overdue: boolean; score?: undefined }
    | { kind: 'deliverable'; id: string; number: number; title: string; projectId: string; projectName: string; dueDate: string; score?: undefined }
    | { kind: 'change'; id: string; number: number; title: string; projectId: string; projectName: string; dueDate?: undefined; score?: undefined }
    | { kind: 'report'; id: string; title: string; projectId: string; projectName: string; number?: undefined; dueDate?: undefined; score?: undefined }
  )[];
  workload: { userId: string; name: string; openTasks: number; overdueTasks: number; weeks?: WorkloadWeek[] }[];
  upcomingMilestones: { id: string; name: string; dueDate: string; projectId: string; projectName: string }[];
};

export type Member = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  projectRole: string;
  active?: boolean;
  weeklyCapacityHours?: number;
  /** Solo llega al Project Manager. */
  hourlyRateCents?: number;
};
export type TimeEntry = {
  id: string;
  taskId: string;
  date: string;
  hours: number;
  note: string;
  user: PersonRef;
  createdAt: string;
  /** Solo llegan al Project Manager. */
  rateCents?: number;
  costCents?: number;
};
/** `byProject`: horas de la semana por proyecto (etapa 8); los proyectos en pausa no cuentan. */
export type WorkloadWeek = { start: string; assignedHours: number; capacityHours: number; overloaded: boolean; byProject?: { projectId: string; name: string; hours: number }[] };

export type Charter = {
  version: number;
  justification: string;
  scopeIncluded: string;
  scopeExcluded: string;
  boundaries: string;
  assumptions: string;
  constraints: string;
  successCriteria: string;
  sponsor: string;
  status: CharterStatus;
  approvedAt: string | null;
  approvedBy: PersonRef | null;
};

export type Objective = { id: string; description: string; metric: string; target: string; status: ObjectiveStatus };
export type Milestone = { id: string; name: string; dueDate: string; status: MilestoneStatus; readyToReach: boolean };
export type Stakeholder = {
  id: string;
  name: string;
  organization: string;
  position: string;
  contact: string;
  influence: Level;
  interest: Level;
  strategy: string;
  currentEngagement: import('@pm/shared').EngagementLevel | null;
  desiredEngagement: import('@pm/shared').EngagementLevel | null;
  expectations: string;
};
export type Risk = {
  id: string;
  version: number;
  description: string;
  type: RiskType;
  probability: number;
  impact: number;
  score: number;
  response: string;
  responsePlan: string;
  ownerId: string | null;
  status: RiskStatus;
  incidents?: IncidentRef[];
  trigger?: string;
  nextReviewDate?: string | null;
  reviewOverdue?: boolean;
  residualProbability?: number | null;
  residualImpact?: number | null;
  residualScore?: number | null;
  /** Solo llega al PM. */
  contingencyCostCents?: number | null;
  assessments?: { assessedAt: string; assessedBy: PersonRef; probability: number; impact: number; residualProbability: number | null; residualImpact: number | null }[];
};
export type Expense = { id: string; description: string; amountCents: number; date: string; category: ExpenseCategory; taskId: string | null };

export type TaskWarning = 'predecessor_not_done' | 'date_conflict';
export type Task = {
  id: string;
  version: number;
  projectId: string;
  milestoneId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  startDate: string | null;
  dueDate: string | null;
  progress: number;
  assignees: PersonRef[];
  predecessorIds: string[];
  predecessors: { id: string; type: import('@pm/shared').DependencyType; lagDays: number }[];
  successorCount: number;
  commentCount: number;
  stepsDone: number;
  stepsTotal: number;
  waitingOn: { id: string; title: string }[];
  warnings: TaskWarning[];
  /** Código EDT calculado por el servidor: 1, 1.2, 1.2.3. */
  wbsCode: string;
  parentId: string | null;
  position: number;
  deliverableId: string | null;
  childCount: number;
  /** Tiene subtareas: fechas, avance, estado y costo salen de ellas. */
  isSummary: boolean;
  /** En una padre, la suma de sus hojas. */
  estimatedHours: number | null;
  projectName?: string;
  /** Solo llega al Project Manager. */
  plannedCostCents?: number;
};
export type TaskRef = { id: string; title: string; wbsCode: string };
export type Comment = { id: string; body: string; createdAt: string; author: PersonRef };
export type TaskStep = { id: string; title: string; done: boolean; assignee: PersonRef | null };
/** `comments` no llega al observador. */
export type TaskDetail = Task & { comments?: Comment[]; steps: TaskStep[]; incidents?: IncidentRef[]; ancestors: TaskRef[]; children: TaskRef[] };

export type Attachment = {
  id: string;
  projectId: string;
  taskId: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: PersonRef;
  createdAt: string;
};

export type Indicators = {
  progress: number;
  overdueTasks: number;
  blockedTasks: number;
  upcomingMilestones: { id: string; name: string; dueDate: string }[];
  budget?: { plannedCents: number; spentCents: number; differenceCents: number };
  highRisks?: number;
};

export type RaciParty = { id: string; name: string };
export type RaciMatrixData = {
  activities: { id: string; title: string; description: string; warnings: import('@pm/shared').RaciWarning[] }[];
  members: RaciParty[];
  stakeholders: RaciParty[];
  cells: { activityId: string; kind: import('@pm/shared').RaciPartyKind; partyId: string; role: import('@pm/shared').RaciRole }[];
};

export type ChangeRequest = {
  id: string;
  number: number;
  title: string;
  description: string;
  requestedBy: string;
  scopeImpact: string;
  scheduleImpactDays: number | null;
  costImpactCents: number | null;
  status: import('@pm/shared').ChangeStatus;
  decisionNote: string;
  decidedAt: string | null;
  decidedBy: PersonRef | null;
  /** Colaborador que la propuso desde el equipo; null si la registró el PM. */
  proposedBy: PersonRef | null;
  appliedAt: string | null;
  appliedBy: PersonRef | null;
  createdAt: string;
  /** Requisitos afectados (F12). */
  requirements: { id: string; number: number }[];
};

/** Lo que ve un colaborador de sus propias propuestas: sin impactos ni solicitante. */
export type ChangeProposal = Pick<ChangeRequest, 'id' | 'number' | 'title' | 'description' | 'status' | 'decisionNote' | 'decidedAt' | 'decidedBy' | 'createdAt' | 'requirements'>;

export type BaselineInfo = {
  version: number;
  reason: string;
  bacCents: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  createdBy: PersonRef;
  changeRequest: { id: string; number: number; title: string } | null;
};
export type EvmTaskState = 'LATE' | 'ON_TIME' | 'OUTSIDE' | 'DELETED';
export type Performance = {
  baseline: BaselineInfo | null;
  history: BaselineInfo[];
  metrics: {
    pvCents: number;
    evCents: number;
    acCents: number;
    bacCents: number;
    cpi: number | null;
    spi: number | null;
    /** Rendimiento de costo necesario para terminar dentro del BAC; ausente en respuestas antiguas. */
    tcpi?: number | null;
    cvCents: number;
    svCents: number;
    eacCents: number;
    eacMethod: 'CPI' | 'ATYPICAL' | 'BUDGET';
    etcCents: number;
    vacCents: number;
    percentComplete: number;
    contingencyCents: number;
    managementCents: number;
    unallocatedCents: number;
    contingencyUseCents: number;
    contingencyExceeded: boolean;
  } | null;
  tasks: {
    taskId: string;
    title: string;
    baselineCostCents: number | null;
    progress: number | null;
    evCents: number | null;
    linkedCostCents: number;
    finishVarianceDays: number | null;
    state: EvmTaskState;
  }[];
  outsideBaseline: number;
  outsideBaselineCostCents: number;
  series: { date: string; pvCents: number; evCents: number | null; acCents: number | null }[];
};

export type IncidentRef = { id: string; number: number; title: string; status: import('@pm/shared').IncidentStatus };
export type Incident = {
  id: string;
  number: number;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  status: import('@pm/shared').IncidentStatus;
  resolution: string;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  overdue: boolean;
  reportedBy: PersonRef;
  owner: PersonRef | null;
  task: { id: string; title: string } | null;
  risk: { id: string; title: string } | null;
  kind: import('@pm/shared').IncidentKind;
  deliverable: { id: string; number: number; name: string } | null;
  can: { edit: boolean; changeStatus: boolean; close: boolean };
};

export type DecisionRecord = {
  id: string;
  number: number;
  title: string;
  rationale: string;
  decidedBy: string;
  decidedOn: string;
  changeRequest: { id: string; number: number; title: string } | null;
  incident: { id: string; number: number; title: string } | null;
  createdAt: string;
};

export type DeliverableRow = {
  id: string;
  version: number;
  number: number;
  name: string;
  status: import('@pm/shared').DeliverableStatus;
  dueDate: string | null;
  overdue: boolean;
  milestone: { id: string; name: string } | null;
  criteriaMet: number;
  criteriaTotal: number;
  /** `stakeholderName` solo llega al PM: quien revisó suele ser un interesado. */
  lastReview: { outcome: import('@pm/shared').ReviewOutcome; reviewedOn: string; stakeholderName?: string } | null;
};
export type DeliverableCriterion = { id: string; text: string; met: boolean; position: number };
export type DeliverableReview = {
  id: string;
  outcome: import('@pm/shared').ReviewOutcome;
  /** Solo para el PM. */
  stakeholder?: { id: string; name: string } | null;
  stakeholderName?: string;
  reviewedOn: string;
  note: string;
  attachment: { id: string; originalName: string } | null;
  attachmentName: string;
  criteria: { text: string; met: boolean }[];
  createdAt: string;
};
export type DeliverableDetail = DeliverableRow & {
  description: string;
  criteria: DeliverableCriterion[];
  reviews: DeliverableReview[];
  /** Tareas ligadas al entregable, en orden EDT. */
  work: { id: string; title: string; wbsCode: string; progress: number }[];
  /** Incidentes ligados que puede ver quien pide; falta si no ve incidentes. */
  incidents?: { id: string; number: number; title: string; kind: import('@pm/shared').IncidentKind; status: import('@pm/shared').IncidentStatus }[];
  /** Solo en la respuesta de una revisión con no conformidad. */
  nonconformity?: { id: string; number: number } | null;
};

export type ClosureReport = {
  dates: { plannedStart: string | null; plannedEnd: string | null; actualStart: string | null; actualEnd: string; endVarianceDays: number | null };
  budget: { plannedCents: number; actualCents: number; varianceCents: number; currency: string };
  performance: { cpi: number | null; spi: number | null; eacCents: number; vacCents: number } | null;
  objectives: { met: number; notMet: number; pending: number };
  deliverables: Record<import('@pm/shared').DeliverableStatus, number>;
  /** `applied` falta en los informes congelados antes de que existiera el estado «Aplicada». */
  changes: { approved: number; applied?: number; rejected: number; pending: number };
  incidents: { total: number; open: number };
  risks: { total: number; open: number };
  pendings: { kind: import('@pm/shared').ClosurePendingKind; count: number }[];
};
type ClosedStatus = 'CLOSED' | 'CANCELLED';
export type ClosureState = {
  status: 'open' | 'closed';
  legacy: boolean;
  report: ClosureReport;
  current: { finalStatus: ClosedStatus; summary: string; pendingReason: string; closedAt: string; closedBy: PersonRef } | null;
  history: {
    id: string;
    finalStatus: ClosedStatus;
    summary: string;
    pendingReason: string;
    closedAt: string;
    closedBy: PersonRef;
    reopenedAt: string | null;
    reopenedBy: PersonRef | null;
    reopenReason: string;
    report: ClosureReport;
  }[];
};

export type Lesson = {
  id: string;
  type: import('@pm/shared').LessonType;
  category: import('@pm/shared').LessonCategory;
  situation: string;
  recommendation: string;
  author: PersonRef;
  project: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

export type ActivityLog = {
  id: string;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId: string | null;
  entityLabel: string;
  changes: ActivityChange[];
  createdAt: string;
  user: PersonRef;
};
export type ActivityPage = { items: ActivityLog[]; nextCursor: string | null };
export type ActivityFilters = { users: PersonRef[]; entities: ActivityEntity[] };

export type Notification = {
  id: string;
  kind: NotificationKind;
  projectId: string;
  projectName: string;
  entityId: string;
  title: string;
  actorName: string;
  /** En un cambio decidido: APPROVED o REJECTED. */
  detail: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = { items: Notification[]; nextCursor: string | null };

export type BudgetCategories = {
  items: { category: import('@pm/shared').ExpenseCategory; plannedCents: number; actualCents: number }[];
  teamLaborCents: number;
  contingencyCents: number;
  managementCents: number;
  unallocatedCents: number;
  overAllocated: boolean;
};

export type ScheduleTask = { id: string; earlyStart: string; earlyFinish: string; lateStart: string; lateFinish: string; totalFloat: number; critical: boolean };
export type Schedule = { tasks: ScheduleTask[]; critical: string[]; unscheduled: string[] };
export type RescheduleChange = { id: string; from: { startDate: string; dueDate: string }; to: { startDate: string; dueDate: string } };

type MilestoneLine = { name: string; dueDate: string };
/** Informe de estado congelado. `budget` y los montos de `performance` solo llegan al PM. */
export type StatusReportSnapshot = {
  health: Health | null;
  progress: { percent: number; overdueTasks: number; blockedTasks: number; doneTasks: number; totalTasks: number };
  performance: {
    cpi: number | null;
    spi: number | null;
    eacMethod: 'CPI' | 'ATYPICAL' | 'BUDGET';
    pvCents?: number;
    evCents?: number;
    acCents?: number;
    eacCents?: number;
    vacCents?: number;
  } | null;
  budget?: { plannedCents: number; actualCents: number; varianceCents: number; currency: string };
  milestones: { reached: MilestoneLine[]; upcoming: MilestoneLine[]; overdue: MilestoneLine[] };
  risks: { openCount: number; top: { description: string; score: number; high: boolean; status: string }[] };
  incidents: { open: number; openedInPeriod: number; resolvedInPeriod: number };
  changes: { pending: number; approvedInPeriod: number; rejectedInPeriod: number; appliedInPeriod: number };
};
export type StatusReportSummary = { id: string; number: number; periodStart: string; periodEnd: string; issuedAt: string; issuedBy: PersonRef };
export type StatusReport = StatusReportSummary & { comment: string; nextSteps: string; report: StatusReportSnapshot };
export type StatusReportList = { items: StatusReportSummary[]; due: boolean };
export type StatusReportDraft = { periodStart: string; periodEnd: string; report: StatusReportSnapshot };
export type CommunicationItem = {
  id: string;
  topic: string;
  audience: string;
  frequency: import('@pm/shared').CommunicationFrequency;
  channel: string;
  ownerId: string | null;
  owner: PersonRef | null;
  notes: string;
};
export type MeetingAgreement = {
  id: string;
  text: string;
  owner: PersonRef | null;
  dueDate: string | null;
  position: number;
  taskId: string | null;
  /** Solo llegan al PM; el colaborador recibe `convertedTo`. */
  decisionId?: string | null;
  incidentId?: string | null;
  convertedTo: import('@pm/shared').AgreementTarget | null;
};
export type Meeting = {
  id: string;
  title: string;
  date: string;
  notes: string;
  attendees: { users: PersonRef[]; stakeholders: PersonRef[] };
  agreements: MeetingAgreement[];
};
export type MeetingSummary = { id: string; title: string; date: string; attendeeCount: number; agreementCount: number };
export type Requirement = {
  id: string;
  number: number;
  description: string;
  priority: import('@pm/shared').Priority;
  status: import('@pm/shared').RequirementStatus;
  acceptance: string;
  version: number;
  deliverables: { id: string; number: number; name: string; status: import('@pm/shared').DeliverableStatus }[];
  /** Solo llega al PM. */
  stakeholder?: PersonRef | null;
  suggestMet: boolean;
};
type TraceDeliverable = { id: string; number: number; name: string; status: import('@pm/shared').DeliverableStatus; tasks: { done: number; total: number }; criteria: { met: number; total: number } };
export type Traceability = {
  requirements: { id: string; number: number; description: string; status: import('@pm/shared').RequirementStatus; priority: import('@pm/shared').Priority; deliverables: TraceDeliverable[] }[];
  orphanDeliverables: { id: string; number: number; name: string }[];
};
export type QualityMetric = {
  id: string;
  name: string;
  unit: string;
  target: number;
  direction: import('@pm/shared').MetricDirection;
  deliverable: { id: string; number: number; name: string } | null;
  latest: { date: string; value: number } | null;
  met: boolean | null;
  measurements: { id: string; date: string; value: number; note: string }[];
};
export type Assumption = {
  id: string;
  number: number;
  description: string;
  owner: PersonRef | null;
  validateBy: string | null;
  status: import('@pm/shared').AssumptionStatus;
  version: number;
  risk: { id: string } | null;
  incident: { id: string; number: number } | null;
  overdue: boolean;
};
export type MilestoneTrendItem = {
  id: string;
  name: string;
  dueDate: string;
  status: import('@pm/shared').MilestoneStatus;
  forecastDate: string | null;
  slipDays: number | null;
  history: { date: string; forecastDate: string }[];
};
