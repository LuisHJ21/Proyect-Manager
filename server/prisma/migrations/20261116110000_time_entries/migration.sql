-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "hourlyRateCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "weeklyCapacityHours" INTEGER NOT NULL DEFAULT 40;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "estimatedHours" DECIMAL(7,2);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "rateCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_idx" ON "TimeEntry"("taskId");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_idx" ON "TimeEntry"("userId");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sin políticas: solo la conexión del servidor accede a la tabla.
ALTER TABLE "TimeEntry" ENABLE ROW LEVEL SECURITY;
