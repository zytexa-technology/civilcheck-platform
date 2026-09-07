-- Buyer push notifications (PDF 12/20): FCM device token + opt-out flag.
-- pushEnabled defaults true so existing buyers keep receiving push once they
-- register a token; SMS is the fallback when push is off or no token exists.
ALTER TABLE "User" ADD COLUMN "fcmToken" TEXT;
ALTER TABLE "User" ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT true;
