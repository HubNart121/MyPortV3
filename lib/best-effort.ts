/** Only for secondary work after a confirmed write; never wrap financial writes. */
export async function waitForBestEffort(
  task: () => Promise<unknown>,
  label: string,
  maxWaitMs = 1500,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = Promise.resolve().then(task).then(() => undefined).catch((error) => {
    console.warn(`${label} failed:`, error);
  });
  try {
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`${label} is still running in the background`);
          resolve();
        }, maxWaitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
