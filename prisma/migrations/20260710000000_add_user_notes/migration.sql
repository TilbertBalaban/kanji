-- CreateTable
CREATE TABLE "UserNote" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "meaningNote" TEXT,
    "readingNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNote_userId_subjectId_idx" ON "UserNote"("userId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNote_userId_subjectId_key" ON "UserNote"("userId", "subjectId");

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
