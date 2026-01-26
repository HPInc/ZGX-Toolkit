/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Pre-package script
 * This script runs before vsce package to replace the root README.md
 * with the marketplace version.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const rootReadme = path.join(rootDir, 'README.md');
const docsReadmeBackup = path.join(rootDir, 'docs', 'README.md.backup');
const marketplaceReadme = path.join(rootDir, 'docs', 'marketplace', 'README.md');

console.log('Running pre-package script...');

try {
  // 1. Copy README.md from root to docs/README.md.backup (overwrite if exists)
  if (fs.existsSync(rootReadme)) {
    console.log('Moving README.md to docs/README.md.backup...');
    fs.copyFileSync(rootReadme, docsReadmeBackup);
    console.log('✓ README.md backed up to docs/README.md.backup');
  } else {
    console.warn('Warning: README.md not found in root directory');
  }

  // 2. Copy docs/marketplace/README.md to repo root (overwrite if exists)
  if (fs.existsSync(marketplaceReadme)) {
    console.log('Copying docs/marketplace/README.md to root...');
    fs.copyFileSync(marketplaceReadme, rootReadme);
    console.log('✓ Marketplace README.md copied to root');
  } else {
    console.error('Error: docs/marketplace/README.md not found');
    process.exit(1);
  }

  console.log('Pre-package script completed successfully!\n');
} catch (error) {
  console.error('Error in pre-package script:', error.message);
  process.exit(1);
}
