# Building the ZGX Toolkit Extension Locally

This guide provides instructions for building ZGX Toolkit VS Code extension on your local development device.

## Prerequisites

Before you can build the extension locally, ensure you have the following installed:

### Required Software

1. **Node.js** (version 16.x or later)
   - Linux: `sudo apt install nodejs npm` (Linux)
   - Windows: Download from [nodejs.org](https://nodejs.org/) (Windows/Mac)
   - Verify installation: `node --version` and `npm --version`

2. **VS Code** (version 1.74.0 or later)
   - Download from [code.visualstudio.com](https://code.visualstudio.com/)
   - Required for the Extension Development Host

3. **Git** (for cloning and version control)
   - Linux: `sudo apt install git`
   - Windows: Download from [git-scm.com](https://git-scm.com/)
   - Download from [git-scm.com](https://git-scm.com/)

4. **SSH Client** (for SSH operations)
   - Linux: Built into most distributions or install via package manager
   - Windows: Built into Windows 10/11 or install via PowerShell
   - Verify installation: `ssh -V`

### Development Dependencies

The following will be installed automatically via npm:

- **TypeScript** (^4.9.4) - Language compiler
- **ESLint** (^8.50.0) - Code linting
- **Jest** (^29.7.0) - Unit testing framework
- **VS Code Extension API Types** (@types/vscode ^1.74.0)

## Getting Started

### 1. Clone the Repository

```powershell
git clone https://github.com/hpi-main/solution-zgx-vscode-extension.git
cd solution-zgx-vscode-extension
```

### 2. Install Dependencies

```powershell
npm install
```

This will install all required development and runtime dependencies defined in `package.json`.

## Building the Extension

### Development Build

For a one-time build that compiles TypeScript to JavaScript:

```powershell
npm run compile
```

This command:

- Compiles TypeScript source files from `src/` to JavaScript in `out/`
- Uses the configuration defined in `tsconfig.json`
- Targets ES2020 with CommonJS modules
- Generates source maps for debugging

### Watch Mode (Recommended for Development)

For continuous building during development:

```powershell
npm run watch
```

This command:

- Automatically rebuilds when TypeScript files change
- Runs in the background - keep the terminal open
- Ideal for active development sessions
- Uses TypeScript's incremental compilation for faster rebuilds

### Production Build

For a production-ready build:

```powershell
npm run vscode:prepublish
```

### Production Distribution Build

Add a version (optional):

```powershell
npm version VERSION --no-git-tag-version
```

Create the `.vsix` package:

```powershell
npx @vscode/vsce package
```

This will generate a `.vsix` file in the current directory that can be installed in VS Code.

To install the built extension using the command line:

```powershell
code --install-extension zgx-toolkit-VERSION.vsix
```

To uninstall the extension:

```powershell
code --uninstall-extension hpinc.zgx-toolkit
```
