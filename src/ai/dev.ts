
import { config } from 'dotenv';
config();

import '@/ai/flows/verify-extracted-date.ts';
import '@/ai/flows/extract-expiry-date.ts';
import '@/ai/flows/smart-ingest-flow.ts';
