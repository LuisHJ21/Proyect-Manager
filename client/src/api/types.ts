import type {
  Approach,
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
  progress?: number;
  team?: PersonRef[];
  /** Solo para Project Manager. */
  plannedBudgetCents?: number;
  currency?: string;
  health?: Health | null;
  overdueTasks?: number;
  highRisks?: number;
  spentCents?: number;
};

export type Dashboard = {
  totals: { activeProjects: number; atRiskProjects: number; overdueTasks: number; overdueProjects: number; highRisks: number; overBudgetProjects: number };
  projects: { id: string; name: string; progress: number; endDate: string | null; health: Health | null; team: PersonRef[] }[];
  attention: (
    | { kind: 'task'; id: string; title: string; projectId: string; projectName: string; dueDate: string; score?: undefined }
    | { kind: 'risk'; id: string; title: string; projectId: string; projectName: string; score: number; dueDate?: undefined }
    | { kind: 'incident'; id: string; number: number; title: string; projectId: string; projectName: string; priority: Priority; dueDate: string | null; overdue: boolean; score?: undefined }
  )[];
  workload: { userId: string; name: string; openTasks: number; overdueTasks: number }[];
  upcomingMilestones: { id: string; name: string; dueDate: string; projectId: string; projectName: string }[];
};

export type Member = { userId: string; name: string; email: string; role: Role; projectRole: string; active?: boolean };

export type Charter = {
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
export type Milestone = { id: string; name: string; dueDate: string; status: MilestoneStatus };
export type Stakeholder = {
  id: string;
  name: string;
  organization: string;
  position: string;
  contact: string;
  influence: Level;
  interest: Level;
  strategy: string;
};
export type Risk = {
  id: string;
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
};
export type Expense = { id: string; description: string; amountCents: number; date: string; category: ExpenseCategory; taskId: string | null };

export type TaskWarning = 'predecessor_not_done' | 'starts_before_predecessor_due';
export type Task = {
  id: string;
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
  successorCount: number;
  commentCount: number;
  stepsDone: number;
  stepsTotal: number;
  waitingOn: { id: string; title: string }[];
  warnings: TaskWarning[];
  projectName?: string;
  /** Solo llega al Project Manager. */
  plannedCostCents?: number;
};
export type Comment = { id: string; body: string; createdAt: string; author: PersonRef };
export type TaskStep = { id: string; title: string; done: boolean; assignee: PersonRef | null };
export type TaskDetail = Task & { comments: Comment[]; steps: TaskStep[]; incidents?: IncidentRef[] };

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
  createdAt: string;
};

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
    cvCents: number;
    svCents: number;
    eacCents: number;
    etcCents: number;
    vacCents: number;
    percentComplete: number;
    reserveCents: number;
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
  number: number;
  name: string;
  status: import('@pm/shared').DeliverableStatus;
  dueDate: string | null;
  overdue: boolean;
  milestone: { id: string; name: string } | null;
  criteriaMet: number;
  criteriaTotal: number;
  lastReview: { outcome: import('@pm/shared').ReviewOutcome; reviewedOn: string; stakeholderName: string } | null;
};
export type DeliverableCriterion = { id: string; text: string; met: boolean; position: number };
export type DeliverableReview = {
  id: string;
  outcome: import('@pm/shared').ReviewOutcome;
  stakeholder: { id: string; name: string } | null;
  stakeholderName: string;
  reviewedOn: string;
  note: string;
  attachment: { id: string; originalName: string } | null;
  attachmentName: string;
  criteria: { text: string; met: boolean }[];
  createdAt: string;
};
export type DeliverableDetail = DeliverableRow & { description: string; criteria: DeliverableCriterion[]; reviews: DeliverableReview[] };
