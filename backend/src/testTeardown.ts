import { execSync } from 'child_process';

export default async function globalTeardown() {
  console.log('\n[Jest Teardown] Restoring database seed data...');
  try {
    execSync('npm run db:seed', { stdio: 'inherit' });
    console.log('[Jest Teardown] ✅ Database successfully re-seeded.');
  } catch (error) {
    console.error('[Jest Teardown] ❌ Failed to re-seed database:', error);
  }
}
