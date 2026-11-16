-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "contingencyReserveCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "managementReserveCents" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BudgetCategory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "plannedCents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetCategory_projectId_category_key" ON "BudgetCategory"("projectId", "category");

-- AddForeignKey
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sin políticas: solo la conexión del servidor accede a la tabla.
ALTER TABLE "BudgetCategory" ENABLE ROW LEVEL SECURITY;
