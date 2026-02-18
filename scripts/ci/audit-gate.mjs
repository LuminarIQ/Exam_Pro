#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const allowlistPath = resolve(root, 'config/security/audit-allowlist.json');
const allowlistFile = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowed = new Set((allowlistFile.allow || []).map((x) => String(x.id)));
const failOn = new Set((allowlistFile.failOnSeverities || ['high', 'critical']).map((s) => String(s).toLowerCase()));

let raw = '';
try {
  raw = execSync('pnpm audit --prod --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  raw = e.stdout?.toString?.() || '';
}

if (!raw.trim()) {
  console.error('Audit output is empty');
  process.exit(1);
}

let audit;
try {
  audit = JSON.parse(raw);
} catch {
  console.error('Failed to parse audit JSON output');
  process.exit(1);
}

const advisories = audit.advisories || {};
const violations = [];

for (const [id, advisory] of Object.entries(advisories)) {
  const severity = String(advisory?.severity || '').toLowerCase();
  if (!failOn.has(severity)) continue;
  if (allowed.has(String(id))) continue;
  violations.push({
    id: String(id),
    severity,
    module: advisory?.module_name,
    title: advisory?.title,
    recommendation: advisory?.recommendation,
    url: advisory?.url,
  });
}

if (violations.length > 0) {
  console.error('Security audit gate failed. Non-allowlisted vulnerabilities found:');
  for (const v of violations) {
    console.error(`- [${v.severity}] ${v.id} ${v.module}: ${v.title}`);
    if (v.recommendation) console.error(`  recommendation: ${v.recommendation}`);
    if (v.url) console.error(`  url: ${v.url}`);
  }
  process.exit(1);
}

console.log('Security audit gate passed.');
