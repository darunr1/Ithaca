import { readConfig } from '../backend/config.js';
import { createGeminiService } from './gemini.js';
const config = readConfig();
if (!config.GEMINI_API_KEY) console.log('SKIPPED: GEMINI_API_KEY is missing. No real Gemini request made.');
else {
  const service = createGeminiService({ ...config, AI_MODE: 'live' });
  const result = await service.extractContributions({ notes: 'Leo Marin validated CAN messages across 200 simulated flight cycles.', roster: [{ id: 'member-leo', name: 'Leo Marin' }] });
  console.log(`Verified Gemini structured response: ${result.drafts.length} drafts; review required. No database writes.`);
}
