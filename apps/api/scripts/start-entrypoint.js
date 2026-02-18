const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const candidates = [
  'dist/apps/api/src/main.js',
  'dist/src/main.js',
  'dist/main.js',
];

const entrypoint = candidates
  .map((rel) => path.resolve(projectRoot, rel))
  .find((abs) => fs.existsSync(abs));

if (!entrypoint) {
  console.error('Unable to locate API build entrypoint.');
  console.error('Checked paths:');
  for (const rel of candidates) {
    console.error(`- ${path.resolve(projectRoot, rel)}`);
  }
  process.exit(1);
}

require(entrypoint);
