// Create / update the database tables without starting the server.
// The server also does this automatically on start-up (unless AUTO_MIGRATE=false).
import * as db from '../src/db.js';

try {
  await db.migrate();
  console.log('[db] schema is up to date');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  const d = await db.connect().catch(() => null);
  await d?.close();
}
