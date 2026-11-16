-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "healthBudgetPercent" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "healthIndexMin" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "healthOverdueTasks" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "highRiskScore" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "lastAssumptionNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "contingencyCostCents" BIGINT,
ADD COLUMN     "nextReviewDate" TEXT,
ADD COLUMN     "residualImpact" INTEGER,
ADD COLUMN     "residualProbability" INTEGER,
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "residualProbability" INTEGER,
    "residualImpact" INTEGER,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessedById" TEXT NOT NULL,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assumption" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "validateBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "riskId" TEXT,
    "incidentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneForecast" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "forecastDate" TEXT NOT NULL,

    CONSTRAINT "MilestoneForecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskAssessment_riskId_idx" ON "RiskAssessment"("riskId");

-- CreateIndex
CREATE INDEX "Assumption_ownerId_idx" ON "Assumption"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Assumption_projectId_number_key" ON "Assumption"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneForecast_milestoneId_date_key" ON "MilestoneForecast"("milestoneId", "date");

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneForecast" ADD CONSTRAINT "MilestoneForecast_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS en las tablas nuevas.
ALTER TABLE "RiskAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assumption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MilestoneForecast" ENABLE ROW LEVEL SECURITY;
