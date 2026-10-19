const POLL_INTERVAL_MS = 20;

/** Polls a condition until it holds; fails with the label when the timeout runs out. */
export async function waitUntil(
  condition: () => Promise<boolean> | boolean,
  options: { timeoutMs?: number; label?: string } = {},
): Promise<void> {
  const { timeoutMs = 5000, label = 'condition' } = options;
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
