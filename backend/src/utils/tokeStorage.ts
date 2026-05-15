import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(__dirname, '../../tokens.json');

export function loadTokens(): Record<string, any> {
  if (!fs.existsSync(TOKEN_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveTokens(tokens: Record<string, any>) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}