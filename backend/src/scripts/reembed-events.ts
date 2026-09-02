import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { eq, sql, and } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { events } from '../db/schema';
import { generateAndSaveEmbedding } from '../services/embeddingService';

async function main() {
  console.log('Starting event embedding re-embed backfill script...');

  // Query events with literal 'null' or 'undefined' in embedding_source_text before fix
  const unsanitizedBeforeRows = await db
    .select({ id: events.id, sourceText: events.embeddingSourceText })
    .from(events)
    .where(
      and(
        eq(events.status, 'published'),
        sql`(${events.embeddingSourceText} ILIKE '%null%' OR ${events.embeddingSourceText} ILIKE '%undefined%')`,
      ),
    );

  const unsanitizedBeforeCount = unsanitizedBeforeRows.length;
  console.log(`[Backfill] Published events with literal "null" or "undefined" before fix: ${unsanitizedBeforeCount}`);

  // Fetch all published events
  const publishedEvents = await db
    .select({ id: events.id, title: events.title })
    .from(events)
    .where(eq(events.status, 'published'));

  const total = publishedEvents.length;
  console.log(`[Backfill] Found ${total} published events to re-embed.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < total; i++) {
    const event = publishedEvents[i];
    try {
      await generateAndSaveEmbedding(event.id);
      successCount++;
    } catch (err: any) {
      failCount++;
      console.error(`[Backfill] Failed to re-embed event ${event.id} ("${event.title}"):`, err?.message || err);
    }
    console.log(`[Backfill] Progress: ${i + 1}/${total} events re-embedded (${successCount} succeeded, ${failCount} failed)`);
  }

  // Query events with literal 'null' or 'undefined' in embedding_source_text after fix
  const unsanitizedAfterRows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.status, 'published'),
        sql`(${events.embeddingSourceText} ILIKE '%null%' OR ${events.embeddingSourceText} ILIKE '%undefined%')`,
      ),
    );

  const unsanitizedAfterCount = unsanitizedAfterRows.length;
  console.log('\n=== Backfill Summary ===');
  console.log(`- Total published events processed: ${total}`);
  console.log(`- Successfully re-embedded: ${successCount}`);
  console.log(`- Failed: ${failCount}`);
  console.log(`- Events with literal "null"/"undefined" BEFORE: ${unsanitizedBeforeCount}`);
  console.log(`- Events with literal "null"/"undefined" AFTER: ${unsanitizedAfterCount}`);

  await pool.end();
}

main().catch((err) => {
  console.error('[Backfill Error]', err);
  process.exit(1);
});
