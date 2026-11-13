-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "uploadedAt" TIMESTAMP(3);

-- Los anexos que ya existían se subieron completos: quedan confirmados.
UPDATE "Attachment" SET "uploadedAt" = "createdAt";
