import cron from "node-cron";

/** Thin wrapper so the worker code stays decoupled from the cron library. */
export function cronEveryMinute(task: () => Promise<void> | void): void {
  cron.schedule("* * * * *", () => {
    void (async () => {
      try {
        await task();
      } catch (err) {
        console.error("[cron] task error:", (err as Error).message);
      }
    })();
  });
}