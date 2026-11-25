CREATE TABLE "cash_count_issues" (
    "cashCountIssueId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "staffUserId" INTEGER NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "recordedBy" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_count_issues_pkey" PRIMARY KEY ("cashCountIssueId")
);

CREATE INDEX "cash_count_issues_propertyId_businessDate_idx" ON "cash_count_issues"("propertyId", "businessDate");
CREATE INDEX "cash_count_issues_staffUserId_idx" ON "cash_count_issues"("staffUserId");

ALTER TABLE "cash_count_issues" ADD CONSTRAINT "cash_count_issues_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_count_issues" ADD CONSTRAINT "cash_count_issues_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_count_issues" ADD CONSTRAINT "cash_count_issues_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
