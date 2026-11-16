-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lastCharterVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shareLessons" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProjectPause" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pausedOn" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "priorityProjectId" TEXT,
    "previousStatus" TEXT NOT NULL,
    "pausedById" TEXT,
    "resumedOn" TEXT,
    "resumedById" TEXT,
    "shiftDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharterVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectPause_projectId_idx" ON "ProjectPause"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CharterVersion_projectId_number_key" ON "CharterVersion"("projectId", "number");

-- AddForeignKey
ALTER TABLE "ProjectPause" ADD CONSTRAINT "ProjectPause_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPause" ADD CONSTRAINT "ProjectPause_priorityProjectId_fkey" FOREIGN KEY ("priorityProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPause" ADD CONSTRAINT "ProjectPause_pausedById_fkey" FOREIGN KEY ("pausedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPause" ADD CONSTRAINT "ProjectPause_resumedById_fkey" FOREIGN KEY ("resumedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharterVersion" ADD CONSTRAINT "CharterVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharterVersion" ADD CONSTRAINT "CharterVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "ProjectPause" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CharterVersion" ENABLE ROW LEVEL SECURITY;
