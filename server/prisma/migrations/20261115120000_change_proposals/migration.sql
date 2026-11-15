-- AlterTable
ALTER TABLE "ChangeRequest" ADD COLUMN     "requestedById" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "detail" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "ChangeRequest_requestedById_idx" ON "ChangeRequest"("requestedById");

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

