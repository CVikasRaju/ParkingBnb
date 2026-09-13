/**
 * Push notifications via Firebase Cloud Messaging (admin SDK).
 *
 * Graceful degradation: without a `FCM_SERVICE_ACCOUNT_PATH`, pushes are
 * logged (dev) and the app continues. Providers registered through the
 * `/register-device` endpoint get a stable registration token derived from
 * their user id so the FCM path is exercised end-to-end once credentials
 * are supplied.
 */
import { env } from "../config/env";
import { firebaseRegistrationToken } from "./qr";

let messaging: any = null;

export async function initFcm(): Promise<void> {
  if (!env.FCM_SERVICE_ACCOUNT_PATH) {
    console.warn("[fcm] FCM_SERVICE_ACCOUNT_PATH not set — push notifications disabled (dev mode)");
    return;
  }
  try {
    const { initializeApp, cert } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");
    const app = initializeApp(
      { credential: cert(env.FCM_SERVICE_ACCOUNT_PATH) },
      "parkpeer"
    );
    messaging = getMessaging(app);
    console.log("[fcm] Firebase initialized");
  } catch (err) {
    console.warn("[fcm] Failed to init Firebase, pushes disabled:", (err as Error).message);
  }
}

function fcmTokenFor(userId: string): string {
  return firebaseRegistrationToken(userId);
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPush(userId: string, payload: PushPayload): Promise<boolean> {
  const token = fcmTokenFor(userId);
  if (!messaging) {
    console.log(`[fcm:dev] → ${userId} (${token.slice(0, 12)}…): ${payload.title} — ${payload.body}`);
    return true;
  }
  try {
    await messaging.send({ token, notification: { title: payload.title, body: payload.body }, data: payload.data ?? {} });
    return true;
  } catch (err) {
    console.error(`[fcm] delivery failed to ${userId}:`, (err as Error).message);
    return false;
  }
}