import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements = [
  `CREATE TABLE IF NOT EXISTS "Problem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "frontendId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleCn" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "leetcodeCnUrl" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "hot100Order" INTEGER NOT NULL,
    "estimatedNewMinutes" INTEGER NOT NULL,
    "estimatedReviewMinutes" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "ProblemProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "lastAcceptedAt" DATETIME,
    "mastery" TEXT,
    "noteIdea" TEXT NOT NULL DEFAULT '',
    "notePitfall" TEXT NOT NULL DEFAULT '',
    "noteComplexity" TEXT NOT NULL DEFAULT '',
    "noteCodeLink" TEXT NOT NULL DEFAULT '',
    "noteLastBlocker" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProblemProgress_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ReviewSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "nextReviewDate" DATETIME NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "consecutiveStrong" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewSchedule_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "StudySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "planItemId" TEXT,
    "kind" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "feelingScore" INTEGER,
    "reviewAfterDays" INTEGER,
    "spentMinutes" INTEGER NOT NULL,
    "noteIdea" TEXT NOT NULL DEFAULT '',
    "notePitfall" TEXT NOT NULL DEFAULT '',
    "noteComplexity" TEXT NOT NULL DEFAULT '',
    "noteCodeLink" TEXT NOT NULL DEFAULT '',
    "noteLastBlocker" TEXT NOT NULL DEFAULT '',
    "noteMarkdown" TEXT NOT NULL DEFAULT '',
    "noteSyntax" TEXT NOT NULL DEFAULT '',
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudySession_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudySession_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "LeetCodeSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT '',
    "statusDisplay" TEXT NOT NULL DEFAULT '',
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" DATETIME NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeetCodeSubmission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Availability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "availableMinutes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "AvailabilitySlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "availableMinutes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "DailyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "availableMinutes" INTEGER NOT NULL,
    "totalEstimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "PlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dailyPlanId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanItem_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanItem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "LeetCodeSyncState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'leetcode-cn',
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "cookie" TEXT NOT NULL DEFAULT '',
    "lastSyncedAt" DATETIME,
    "lastCodeSyncedAt" DATETIME,
    "lastError" TEXT NOT NULL DEFAULT '',
    "lastCodeSyncError" TEXT NOT NULL DEFAULT '',
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "checkedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "appPasswordHash" TEXT NOT NULL DEFAULT '',
    "defaultDailyMinutes" INTEGER NOT NULL DEFAULT 150,
    "targetDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Problem_frontendId_key" ON "Problem"("frontendId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Problem_slug_key" ON "Problem"("slug")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ProblemProgress_problemId_key" ON "ProblemProgress"("problemId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReviewSchedule_problemId_key" ON "ReviewSchedule"("problemId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LeetCodeSubmission_submissionId_key" ON "LeetCodeSubmission"("submissionId")`,
  `CREATE INDEX IF NOT EXISTS "LeetCodeSubmission_problemId_submittedAt_idx" ON "LeetCodeSubmission"("problemId", "submittedAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Availability_date_key" ON "Availability"("date")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DailyPlan_date_key" ON "DailyPlan"("date")`,
  `CREATE INDEX IF NOT EXISTS "AvailabilitySlot_date_idx" ON "AvailabilitySlot"("date")`,
];

const optionalColumns = [
  `ALTER TABLE "ProblemProgress" ADD COLUMN "lastSubmittedAt" DATETIME`,
  `ALTER TABLE "ProblemProgress" ADD COLUMN "totalSubmissions" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "ProblemProgress" ADD COLUMN "acceptedSubmissions" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "ProblemProgress" ADD COLUMN "acceptedRate" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "ProblemProgress" ADD COLUMN "reviewRiskScore" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "PlanItem" ADD COLUMN "availabilitySlotId" TEXT`,
  `ALTER TABLE "StudySession" ADD COLUMN "noteMarkdown" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "StudySession" ADD COLUMN "noteSyntax" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "StudySession" ADD COLUMN "feelingScore" INTEGER`,
  `ALTER TABLE "StudySession" ADD COLUMN "reviewAfterDays" INTEGER`,
  `ALTER TABLE "StudySession" ADD COLUMN "planItemId" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StudySession_planItemId_key" ON "StudySession"("planItemId")`,
  `ALTER TABLE "LeetCodeSyncState" ADD COLUMN "lastCodeSyncedAt" DATETIME`,
  `ALTER TABLE "LeetCodeSyncState" ADD COLUMN "lastCodeSyncError" TEXT NOT NULL DEFAULT ''`,
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  for (const statement of optionalColumns) {
    await prisma.$executeRawUnsafe(statement).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes("duplicate column name")) {
        throw error;
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
