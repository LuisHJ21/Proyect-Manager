CREATE TABLE "FileDeletion" (
    "storedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileDeletion_pkey" PRIMARY KEY ("storedName")
);

ALTER TABLE "FileDeletion" ENABLE ROW LEVEL SECURITY;
