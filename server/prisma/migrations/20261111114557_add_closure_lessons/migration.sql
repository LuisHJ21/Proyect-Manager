-- AlterTable
ALTER TABLE "Project" ADD COLUMN "closedAt" DATETIME;

-- CreateTable
CREATE TABLE "ProjectClosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "finalStatus" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "pendingReason" TEXT NOT NULL DEFAULT '',
    "report" TEXT NOT NULL,
    "closedAt" DATETIME NOT NULL,
    "closedById" TEXT NOT NULL,
    "reopenedAt" DATETIME,
    "reopenedById" TEXT,
    "reopenReason" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ProjectClosure_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectClosure_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectClosure_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "situation" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lesson_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lesson_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectClosure_projectId_idx" ON "ProjectClosure"("projectId");

-- CreateIndex
CREATE INDEX "Lesson_projectId_idx" ON "Lesson"("projectId");

-- CreateIndex
CREATE INDEX "Lesson_category_idx" ON "Lesson"("category");
