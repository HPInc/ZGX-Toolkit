/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Clean output directory
const outDir = path.join(__dirname, '..', 'out');
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
    outfile: 'out/extension.js',
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
    target: 'node16',
    define: {
        'process.env.NODE_ENV': '"production"'
    }
};

// Function to copy native modules and their dependencies
function copyNativeModules() {
    const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
    const outNodeModulesPath = path.join(outDir, 'node_modules');
    
    // Packages that need to be copied (including transitive dependencies)
    const packagesToCopy = [
        // Main packages
        'ssh2',
        'dnssd',
        // ssh2 dependencies
        'asn1',
        'bcrypt-pbkdf',
        'nan',
        // asn1 dependencies
        'safer-buffer',
        // bcrypt-pbkdf dependencies
        'tweetnacl',
    ];
    
    for (const packageName of packagesToCopy) {
        const sourcePath = path.join(nodeModulesPath, packageName);
        const targetPath = path.join(outNodeModulesPath, packageName);
        
        if (fs.existsSync(sourcePath)) {
            console.log(`Copying ${packageName}...`);
            copyPackageSelectively(sourcePath, targetPath);
        }
    }
    
    // Copy package.json for dependency resolution
    const packageJsonSource = path.join(__dirname, '..', 'package.json');
    const packageJsonTarget = path.join(outDir, 'package.json');
    if (fs.existsSync(packageJsonSource)) {
        const packageData = JSON.parse(fs.readFileSync(packageJsonSource, 'utf8'));
        // Only include runtime dependencies
        const runtimePackage = {
            name: packageData.name,
            version: packageData.version,
            dependencies: {
                'ssh2': packageData.dependencies.ssh2,
                'dnssd': packageData.dependencies.dnssd
            }
        };
        fs.writeFileSync(packageJsonTarget, JSON.stringify(runtimePackage, null, 2));
        console.log('Created runtime package.json');
    }
}

function copyPackageSelectively(src, dest) {
    if (!fs.existsSync(src)) return;
    
    // Ensure destination directory exists
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    // Copy package.json first and read it to get the main entry
    const packageJsonSrc = path.join(src, 'package.json');
    if (fs.existsSync(packageJsonSrc)) {
        fs.copyFileSync(packageJsonSrc, path.join(dest, 'package.json'));
        
        // Read package.json to get the main entry point
        const packageData = JSON.parse(fs.readFileSync(packageJsonSrc, 'utf8'));
        const mainEntry = packageData.main || 'index.js';
        
        // Copy the main entry file if it exists
        const mainPath = path.join(src, mainEntry);
        if (fs.existsSync(mainPath)) {
            const destMainPath = path.join(dest, mainEntry);
            const destMainDir = path.dirname(destMainPath);
            if (!fs.existsSync(destMainDir)) {
                fs.mkdirSync(destMainDir, { recursive: true });
            }
            fs.copyFileSync(mainPath, destMainPath);
        }
    }
    
    // Copy essential directories
    const dirsToInclude = ['lib', 'build', 'src'];
    dirsToInclude.forEach(dir => {
        const dirPath = path.join(src, dir);
        if (fs.existsSync(dirPath)) {
            copyRecursiveSync(dirPath, path.join(dest, dir));
        }
    });
    
    // Copy common entry point files that might be at root level
    const commonFiles = ['index.js', 'main.js', 'safer.js'];
    commonFiles.forEach(file => {
        const filePath = path.join(src, file);
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, path.join(dest, file));
        }
    });
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
            // Skip test directories and documentation
            if (file === 'test' || file === 'tests' || file === 'docs' || 
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

async function build() {
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
}

build();