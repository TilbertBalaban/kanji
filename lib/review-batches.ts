// Review sessions serve one batch of the due queue at a time (reviewBatchSize
// on UserProgress) — 100 due items with the default 40 become batches of 40,
// 40 and 20. The review APIs return `totalDue`, the queue length *including*
// the batch they just served, so each fetch re-derives the same total: batches
// already done + those still left.

export interface BatchProgress {
  batchNumber: number;
  totalBatches: number;
  /** Items still due after the served batch is finished. */
  remaining: number;
}

export function batchProgress(
  batchesDone: number,
  totalDue: number,
  batchSize: number,
  served: number,
): BatchProgress {
  return {
    batchNumber: batchesDone + 1,
    totalBatches:
      batchSize > 0
        ? batchesDone + Math.max(1, Math.ceil(totalDue / batchSize))
        : batchesDone + 1,
    remaining: Math.max(0, totalDue - served),
  };
}
