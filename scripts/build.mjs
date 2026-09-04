/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Clean output directory
const outDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Build configuration
const isWatch = process.argv.includes('--watch');
const isMinify = process.argv.includes('--minify');

const buildOptions = {
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: [
        'vscode',
        // Mark packages with native modules as external
        'ssh2',
        'dnssd'
    ],
    format: 'cjs',
    platform: 'node',
    sourcemap: true,
    minify: isMinify,
    target: 'node22',
    define: {
        'process.env.NODE_ENV': '"production"'
    }
};

// Walks package-lock.json to find the full transitive dependency set of the given
// packages, so the copy list can't silently drift out of sync with their real deps.
function resolveNativeModuleDeps(rootNames) {
    const lockPath = path.join(__dirname, '..', 'package-lock.json');
    const { packages = {} } = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

    const resolved = new Set();
    const queue = [...rootNames];
    while (queue.length > 0) {
        const name = queue.shift();
        if (resolved.has(name)) continue;
        resolved.add(name);

        const entry = packages[`node_modules/${name}`];
        if (!entry) continue;
        const deps = { ...entry.dependencies, ...entry.optionalDependencies };
        for (const depName of Object.keys(deps)) {
            if (!resolved.has(depName)) queue.push(depName);
        }
    }

    return [...resolved];
}

// Function to copy native modules and their dependencies
function copyNativeModules() {
    const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
    const outNodeModulesPath = path.join(outDir, 'node_modules');

    // Derive the roots from buildOptions.external so adding a native external stays a one-line change
    const nativeExternals = buildOptions.external.filter(name => name !== 'vscode');
    const packagesToCopy = resolveNativeModuleDeps(nativeExternals);

    for (const packageName of packagesToCopy) {
        const sourcePath = path.join(nodeModulesPath, packageName);
        const targetPath = path.join(outNodeModulesPath, packageName);

        if (fs.existsSync(sourcePath)) {
            console.log(`Copying ${packageName}...`);
            copyRecursiveSync(sourcePath, targetPath);
        }
    }

    // Copy package.json for dependency resolution
    const packageJsonSource = path.join(__dirname, '..', 'package.json');
    const packageJsonTarget = path.join(outDir, 'package.json');
    if (fs.existsSync(packageJsonSource)) {
        const packageData = JSON.parse(fs.readFileSync(packageJsonSource, 'utf8'));
        // Only include the direct native-external dependencies (not their transitive deps)
        const runtimePackage = {
            name: packageData.name,
            version: packageData.version,
            dependencies: Object.fromEntries(
                nativeExternals.map(name => [name, packageData.dependencies[name]])
            )
        };
        fs.writeFileSync(packageJsonTarget, JSON.stringify(runtimePackage, null, 2));
        console.log('Created runtime package.json');
    }
}

function copyRecursiveSync(src, dest) {
    if (!fs.existsSync(src)) return;

    const stats = fs.statSync(src);

    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const files = fs.readdirSync(src);
        for (const file of files) {
            // Skip test/doc cruft; nested node_modules are skipped since transitive
            // deps are already resolved and copied individually at the top level
            if (file === 'test' || file === 'tests' || file === 'docs' ||
                file === 'node_modules' ||
                file.endsWith('.test.js') || file.endsWith('.md')) {
                continue;
            }
            copyRecursiveSync(path.join(src, file), path.join(dest, file));
        }
    } else {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
    }
}

try {
    console.log('Building extension...');

    if (isWatch) {
        const context = await esbuild.context(buildOptions);
        await context.watch();
        console.log('Watching for changes...');
    } else {
        await esbuild.build(buildOptions);
        console.log('Build completed successfully');
    }

    // Copy native modules after successful build
    copyNativeModules();
} catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
}
