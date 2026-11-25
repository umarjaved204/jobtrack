// Accessibility scan of the main screens with axe-core, at both widths and in both
// schemes (contrast differs per theme). A check, not a proof: axe finds roughly a third of
// WCAG issues (names, roles, contrast, landmarks); keyboard flows and announcements still
// need a person. Exits 1 if anything is found, so it can gate CI later (Phase 11).
//
//   pnpm a11y                  # every page
//   pnpm a11y board,calendar   # only these shots
//
// Pages, sign-in and setup: app-pages.mjs. Same needs as `pnpm screenshots`.
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

import { BASE_URL, runAll } from './app-pages.mjs';

const ONLY = process.argv[2]?.split(',');
// WCAG 2.2 A and AA, plus axe's best practices (landmarks, heading order, ...).
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** rule id → { impact, help, url, where: Set of "shot (viewport, scheme): target" } */
const found = new Map();

const browser = await chromium.launch();
try {
  console.log(`Accessibility scan of ${BASE_URL}`);
  await runAll(browser, ONLY, async (page, shot, viewport, scheme) => {
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    console.log(`  ${shot.name} (${viewport}, ${scheme}): ${violations.length} rule(s) failed`);
    for (const v of violations) {
      const entry = found.get(v.id) ?? {
        impact: v.impact,
        help: v.help,
        url: v.helpUrl,
        where: new Set(),
      };
      for (const node of v.nodes)
        entry.where.add(`${shot.name} (${viewport}, ${scheme}): ${node.target.join(' ')}`);
      found.set(v.id, entry);
    }
  });
} finally {
  await browser.close();
}

if (found.size === 0) {
  console.log('\nNo axe violations.');
} else {
  console.log(`\n${found.size} rule(s) failed:`);
  for (const [id, { impact, help, url, where }] of found) {
    console.log(`\n[${impact}] ${id}: ${help}\n  ${url}`);
    for (const w of [...where].slice(0, 12)) console.log(`  - ${w}`);
    if (where.size > 12) console.log(`  … and ${where.size - 12} more`);
  }
  process.exitCode = 1;
}
