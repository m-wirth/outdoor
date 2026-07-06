import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Aufruf: pnpm password -- "neues-passwort" (mindestens 8 Zeichen)');
  process.exit(1);
}

const path = new URL('../public/app-settings.json', import.meta.url);
const settings = JSON.parse(await readFile(path, 'utf8'));
settings.passwordSalt = randomBytes(16).toString('hex');
settings.passwordHash = createHash('sha256').update(`${settings.passwordSalt}:${password}`).digest('hex');
await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`);
console.log('Passwort-Hash in public/app-settings.json aktualisiert.');
