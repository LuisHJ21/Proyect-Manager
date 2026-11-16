-- AlterTable
ALTER TABLE "ChangeRequest" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "appliedById" TEXT;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
