CREATE TABLE "ProjectRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "ProjectRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectRole_projectId_name_key" ON "ProjectRole"("projectId", "name");
ALTER TABLE "ProjectRole" ADD CONSTRAINT "ProjectRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRole" ENABLE ROW LEVEL SECURITY;

INSERT INTO "ProjectRole" ("id", "projectId", "name")
SELECT md5("projectId" || ':' || "projectRole"), "projectId", "projectRole"
FROM "ProjectMember" WHERE "projectRole" <> ''
GROUP BY "projectId", "projectRole";

ALTER TABLE "TaskStep" DROP CONSTRAINT "TaskStep_assigneeId_fkey";
ALTER TABLE "TaskStep" DROP COLUMN "assigneeId";
ALTER TABLE "TaskStep" ADD COLUMN "completedById" TEXT;
ALTER TABLE "TaskStep" ADD CONSTRAINT "TaskStep_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
