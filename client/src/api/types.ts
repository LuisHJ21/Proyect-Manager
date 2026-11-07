import type {
  Approach,
  CharterStatus,
  ExpenseCategory,
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

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  approach: Approach;
  startDate: string | null;
  endDate: string | null;
  progress?: number;
  /** Solo para Project Manager. */
  plannedBudgetCents?: number;
  currency?: string;
};

export type Member = { userId: string; name: string; email: string; role: Role; projectRole: string };

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
};
export type Expense = { id: string; description: string; amountCents: number; date: string; category: ExpenseCategory };

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
  waitingOn: { id: string; title: string }[];
  warnings: TaskWarning[];
  projectName?: string;
};
export type Comment = { id: string; body: string; createdAt: string; author: PersonRef };
export type TaskDetail = Task & { comments: Comment[] };

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
