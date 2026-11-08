-- CreateTable
CREATE TABLE "RaciActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RaciActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RaciCell" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "stakeholderId" TEXT,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RaciCell_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RaciActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RaciCell_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RaciCell_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RaciActivity_projectId_idx" ON "RaciActivity"("projectId");

-- CreateIndex
CREATE INDEX "RaciCell_stakeholderId_idx" ON "RaciCell"("stakeholderId");

-- CreateIndex
CREATE INDEX "RaciCell_userId_idx" ON "RaciCell"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RaciCell_activityId_userId_key" ON "RaciCell"("activityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RaciCell_activityId_stakeholderId_key" ON "RaciCell"("activityId", "stakeholderId");
