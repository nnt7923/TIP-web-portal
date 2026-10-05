CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_eventId_recipientAccountId_key" ON "Notification"("eventId", "recipientAccountId");
CREATE INDEX "Notification_recipientAccountId_createdAt_id_idx" ON "Notification"("recipientAccountId", "createdAt", "id");
CREATE INDEX "Notification_recipientAccountId_readAt_createdAt_id_idx" ON "Notification"("recipientAccountId", "readAt", "createdAt", "id");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientAccountId_fkey" FOREIGN KEY ("recipientAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
