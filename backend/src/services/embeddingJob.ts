import { generateAndSaveEmbedding } from './embeddingService';

// Set tracking active background jobs for clean test teardown and synchronization
const activeJobs = new Set<Promise<void>>();

/**
 * Awaits all currently active background embedding jobs. Useful for tests to ensure background tasks complete before test suite teardown.
 */
export async function drainEmbeddingJobs(): Promise<void> {
  await Promise.all(Array.from(activeJobs));
}

/**
 * Helper to determine whether updated event fields affect embedding_source_text.
 */
export function hasEmbeddingRelevantChanges(
  oldState: {
    title: string;
    tagline: string | null;
    description: string;
    tagIds: number[];
    eligibilityCategoryIds: number[];
    eligibilityNotes: string | null;
    prizeSummaryText?: string | null;
  },
  newState: {
    title: string;
    tagline?: string | null;
    description: string;
    tag_ids?: number[];
    eligibility_category_ids?: number[];
    eligibility_notes?: string | null;
    prize_summary_text?: string | null;
  },
): boolean {
  if (oldState.title !== newState.title) return true;
  if ((oldState.tagline ?? null) !== (newState.tagline ?? null)) return true;
  if (oldState.description !== newState.description) return true;
  if ((oldState.eligibilityNotes ?? null) !== (newState.eligibility_notes ?? null)) return true;
  if ((oldState.prizeSummaryText ?? null) !== (newState.prize_summary_text ?? null)) return true;

  const oldTags = [...(oldState.tagIds || [])].sort((a, b) => a - b);
  const newTags = [...(newState.tag_ids || [])].sort((a, b) => a - b);
  if (oldTags.length !== newTags.length || oldTags.some((v, i) => v !== newTags[i])) {
    return true;
  }

  const oldCats = [...(oldState.eligibilityCategoryIds || [])].sort((a, b) => a - b);
  const newCats = [...(newState.eligibility_category_ids || [])].sort((a, b) => a - b);
  if (oldCats.length !== newCats.length || oldCats.some((v, i) => v !== newCats[i])) {
    return true;
  }

  return false;
}

/**
 * Enqueues an in-process async background task to compute and save the embedding for an event.
 * The calling HTTP handler does NOT await this function.
 * Implements exponential backoff retries and error isolation so failures never crash the server.
 */
export function enqueueEmbeddingJob(eventId: string, maxRetries = 3, initialRetryDelayMs = 50): void {
  const jobPromise = (async () => {
    let attempts = 0;
    let delay = initialRetryDelayMs;

    while (attempts < maxRetries) {
      try {
        await generateAndSaveEmbedding(eventId);
        return;
      } catch (err: any) {
        attempts++;
        console.error(
          `[EmbeddingJob] Attempt ${attempts}/${maxRetries} failed for event ${eventId}:`,
          err?.message || err,
        );

        if (attempts < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }

    console.error(
      `[EmbeddingJob] All ${maxRetries} attempts failed for event ${eventId}. Event remains functional without embedding.`,
    );
  })();

  activeJobs.add(jobPromise);
  jobPromise.finally(() => {
    activeJobs.delete(jobPromise);
  });
}
