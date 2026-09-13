/** Drain every operation before allowing rollback to start. */
export async function settleRestoreOperations(operations: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(operations);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

/** BulkWriter.close() does not reject individual failed writes. Observe them immediately. */
export async function runRestoreWrites(
  enqueue: (track: (operation: Promise<unknown>) => void) => void,
  close: () => Promise<unknown>,
): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const failures: unknown[] = [];
  try {
    enqueue((operation) => {
      pending.push(operation.catch((error) => { failures.push(error); }));
    });
  } catch (error) {
    failures.push(error);
  }
  try { await close(); } catch (error) { failures.push(error); }
  await Promise.all(pending);
  if (failures.length) throw failures[0];
}
