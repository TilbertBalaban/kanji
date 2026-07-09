-- CreateTable
CREATE TABLE "UserSynonym" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "synonym" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSynonym_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSynonym_userId_subjectId_idx" ON "UserSynonym"("userId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSynonym_userId_subjectId_synonym_key" ON "UserSynonym"("userId", "subjectId", "synonym");

-- AddForeignKey
ALTER TABLE "UserSynonym" ADD CONSTRAINT "UserSynonym_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
