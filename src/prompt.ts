import { readFileSync } from 'node:fs';
import { digest } from './domain.js';
export const instructions = readFileSync(new URL('../prompts/response.md', import.meta.url), 'utf8');
export const promptVersion = digest(instructions);
