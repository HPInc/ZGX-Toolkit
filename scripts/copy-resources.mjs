/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Create resources directory if it doesn't exist
const resourcesDir = path.join(dirname, '..', 'resources');
if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
}

// Copy codicon CSS
const codiconCssSource = path.join(dirname, '..', 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
const codiconCssTarget = path.join(resourcesDir, 'codicon.css');

if (fs.existsSync(codiconCssSource)) {
    fs.copyFileSync(codiconCssSource, codiconCssTarget);
    console.log('Copied codicon.css');
} else {
    console.error('codicon.css not found at', codiconCssSource);
}

// Copy codicon font
const codiconFontSource = path.join(dirname, '..', 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf');
const codiconFontTarget = path.join(resourcesDir, 'codicon.ttf');

if (fs.existsSync(codiconFontSource)) {
    fs.copyFileSync(codiconFontSource, codiconFontTarget);
    console.log('Copied codicon.ttf');
} else {
    console.error('codicon.ttf not found at', codiconFontSource);
}

// Copy view template files (.html, .css, .js) from src/views to dist/views
function copyViewTemplates() {
    const srcViewsDir = path.join(dirname, '..', 'src', 'views');
    const outViewsDir = path.join(dirname, '..', 'dist', 'views');

    // Recursively copy template files
    function copyDirectory(src, dest) {
        if (!fs.existsSync(src)) {
            console.warn('Source directory not found:', src);
            return;
        }

        // Create destination directory if it doesn't exist
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                // Recursively copy subdirectories
                copyDirectory(srcPath, destPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                // Copy .html, .css, and .js files (but not .ts files)
                if (['.html', '.css', '.js'].includes(ext)) {
                    fs.copyFileSync(srcPath, destPath);
                    console.log(`Copied ${path.relative(path.join(dirname, '..'), srcPath)} -> ${path.relative(path.join(dirname, '..'), destPath)}`);
                }
            }
        }
    }

    copyDirectory(srcViewsDir, outViewsDir);
}

copyViewTemplates();