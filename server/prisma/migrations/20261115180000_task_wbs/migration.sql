-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deliverableId" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Numera las tareas existentes en el orden de la lista actual, para que el código EDT sea estable.
UPDATE "Task" t SET "position" = s.rn
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", id) AS rn FROM "Task") s
WHERE t.id = s.id;

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
