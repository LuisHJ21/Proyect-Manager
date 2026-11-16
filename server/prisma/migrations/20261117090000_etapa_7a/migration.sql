-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lastRequirementNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "deliverableId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INCIDENT';

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "stakeholderId" TEXT,
    "acceptance" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementDeliverable" (
    "requirementId" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,

    CONSTRAINT "RequirementDeliverable_pkey" PRIMARY KEY ("requirementId","deliverableId")
);

-- CreateTable
CREATE TABLE "ChangeRequestRequirement" (
    "changeRequestId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,

    CONSTRAINT "ChangeRequestRequirement_pkey" PRIMARY KEY ("changeRequestId","requirementId")
);

-- CreateTable
CREATE TABLE "QualityMetric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "target" DECIMAL(14,4) NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'HIGHER_BETTER',
    "deliverableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityMeasurement" (
    "id" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Requirement_stakeholderId_idx" ON "Requirement"("stakeholderId");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_projectId_number_key" ON "Requirement"("projectId", "number");

-- CreateIndex
CREATE INDEX "RequirementDeliverable_deliverableId_idx" ON "RequirementDeliverable"("deliverableId");

-- CreateIndex
CREATE INDEX "ChangeRequestRequirement_requirementId_idx" ON "ChangeRequestRequirement"("requirementId");

-- CreateIndex
CREATE INDEX "QualityMetric_projectId_idx" ON "QualityMetric"("projectId");

-- CreateIndex
CREATE INDEX "QualityMetric_deliverableId_idx" ON "QualityMetric"("deliverableId");

-- CreateIndex
CREATE INDEX "QualityMeasurement_metricId_idx" ON "QualityMeasurement"("metricId");

-- CreateIndex
CREATE INDEX "Incident_deliverableId_idx" ON "Incident"("deliverableId");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementDeliverable" ADD CONSTRAINT "RequirementDeliverable_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementDeliverable" ADD CONSTRAINT "RequirementDeliverable_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestRequirement" ADD CONSTRAINT "ChangeRequestRequirement_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestRequirement" ADD CONSTRAINT "ChangeRequestRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityMetric" ADD CONSTRAINT "QualityMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityMetric" ADD CONSTRAINT "QualityMetric_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityMeasurement" ADD CONSTRAINT "QualityMeasurement_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "QualityMetric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityMeasurement" ADD CONSTRAINT "QualityMeasurement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS en las tablas nuevas.
ALTER TABLE "Requirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RequirementDeliverable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChangeRequestRequirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualityMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualityMeasurement" ENABLE ROW LEVEL SECURITY;
