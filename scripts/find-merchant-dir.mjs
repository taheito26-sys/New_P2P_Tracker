import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const candidateDirs = [
  'src/pages/merchant',
  'src/merchant',
  'directories/merchant',
];

async function exists(relativePath) {
  try {
    await access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

for (const candidate of candidateDirs) {
  if (await exists(candidate)) {
    console.log(candidate);
    process.exit(0);
  }
}

console.error(`Merchant directory not found. Checked: ${candidateDirs.join(', ')}`);
process.exit(1);
