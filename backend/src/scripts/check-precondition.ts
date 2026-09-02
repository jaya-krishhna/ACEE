import { db } from '../db/client';
import { events } from '../db/schema';
import { eq } from 'drizzle-orm';

async function check() {
  const publishedEvents = await db.select().from(events).where(eq(events.status, 'published'));
  console.log('Total published events:', publishedEvents.length);

  let staleCount = 0;
  let pollutedCount = 0;

  for (const event of publishedEvents) {
    if (!event.embeddingUpdatedAt || !event.embedding) {
      console.error('Stale embedding found for event:', event.id, event.title);
      staleCount++;
    }
    if (event.embeddingSourceText) {
      if (event.embeddingSourceText.includes('null') || event.embeddingSourceText.includes('undefined')) {
        console.error('Polluted embedding_source_text found for event:', event.id, event.title, 'Text:', event.embeddingSourceText);
        pollutedCount++;
      }
    } else {
      console.error('Missing embeddingSourceText for event:', event.id, event.title);
      staleCount++;
    }
  }

  console.log('PRECONDITION SUMMARY:', { total: publishedEvents.length, staleCount, pollutedCount });
  if (staleCount > 0 || pollutedCount > 0) {
    console.error('PRECONDITION FAILED!');
    process.exit(1);
  } else {
    console.log('PRECONDITION PASSED!');
    process.exit(0);
  }
}

check().catch((err) => {
  console.error(err);
  process.exit(1);
});
