-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "milestoneId" TEXT,
    "dueDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deliverable_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliverableCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliverableId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "met" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliverableCriterion_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliverableReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliverableId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "stakeholderId" TEXT,
    "stakeholderName" TEXT NOT NULL DEFAULT '',
    "reviewedOn" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "attachmentId" TEXT,
    "attachmentName" TEXT NOT NULL DEFAULT '',
    "criteria" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliverableReview_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliverableReview_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliverableReview_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliverableReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "approach" TEXT NOT NULL DEFAULT 'PREDICTIVE',
    "startDate" TEXT,
    "endDate" TEXT,
    "plannedBudgetCents" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lastChangeNumber" INTEGER NOT NULL DEFAULT 0,
    "lastIncidentNumber" INTEGER NOT NULL DEFAULT 0,
    "lastDecisionNumber" INTEGER NOT NULL DEFAULT 0,
    "lastDeliverableNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("approach", "createdAt", "currency", "description", "endDate", "id", "lastChangeNumber", "lastDecisionNumber", "lastIncidentNumber", "name", "plannedBudgetCents", "startDate", "status", "updatedAt") SELECT "approach", "createdAt", "currency", "description", "endDate", "id", "lastChangeNumber", "lastDecisionNumber", "lastIncidentNumber", "name", "plannedBudgetCents", "startDate", "status", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Deliverable_milestoneId_idx" ON "Deliverable"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_projectId_number_key" ON "Deliverable"("projectId", "number");

-- CreateIndex
CREATE INDEX "DeliverableCriterion_deliverableId_idx" ON "DeliverableCriterion"("deliverableId");

-- CreateIndex
CREATE INDEX "DeliverableReview_deliverableId_idx" ON "DeliverableReview"("deliverableId");

-- CreateIndex
CREATE INDEX "DeliverableReview_stakeholderId_idx" ON "DeliverableReview"("stakeholderId");

-- CreateIndex
CREATE INDEX "DeliverableReview_attachmentId_idx" ON "DeliverableReview"("attachmentId");
