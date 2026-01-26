/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Post-package script
 * This script runs after vsce package to restore the original README.md
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const rootReadme = path.join(rootDir, 'README.md');
const docsReadmeBackup = path.join(rootDir, 'docs', 'README.md.backup');

console.log('Running post-package script...');

try {
  // Copy docs/README.md.backup to repo root as README.md (overwrite)
  if (fs.existsSync(docsReadmeBackup)) {
    console.log('Restoring original README.md from backup...');
    fs.copyFileSync(docsReadmeBackup, rootReadme);
    console.log('✓ Original README.md restored');
    
    // Clean up backup file
    fs.unlinkSync(docsReadmeBackup);
    console.log('✓ Backup file removed');
  } else {
    console.warn('Warning: docs/README.md.backup not found');
  }

  console.log('Post-package script completed successfully!');
} catch (error) {
  console.error('Error in post-package script:', error.message);
  process.exit(1);
}
