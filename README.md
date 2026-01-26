# HP ZGX Toolkit

## Overview 

The HP ZGX Toolkit streamlines AI development workflows on the HP ZGX desktop AI supercomputer by providing automated setup of essential open-source AI tools and seamless device discovery on your LAN. This VS Code extension enables developers to quickly configure their ZGX environment for model fine-tuning and local inference, while solving common network connectivity challenges. 

## About the HP ZGX Toolkit 

The HP ZGX Toolkit addresses two critical pain points for AI developers working with the HP ZGX hardware. First, it provides an automated installation and management system for a curated open-source AI development stack, eliminating hours of manual configuration and dependency resolution. With a single command through the VS Code interface, developers can install and configure Python packages to support model finetuning, experiment tracking and inference, as well as other AI development tools - all optimized for the ZGX's ARM-based architecture and Blackwell GPU. With the ZGX Toolkit, package dependencies are a thing of the past. 

Second, the toolkit includes lightweight IP discovery functionality that automatically locates your ZGX device whether setting up for the first time or when DHCP assigns new IP addresses. This eliminates the frustration of broken SSH connections after router reboots or network changes, saving developers 5-10 minutes of troubleshooting each time their device's IP changes. 

![HP ZGX Toolkit Diagram](/docs/marketplace/images/zgx-tk-extension-diagram.png)

## Quick Start 

1. Install the HP ZGX Toolkit extension from the VS Code Marketplace 
2. Go to the Device Manager and run the ZGX discovery command to locate your device on the network 
3. Connect to your ZGX via the extension's SSH integration and have the Toolkit create SSH keys for you. 
4. Select and install desired components from the curated AI stack (Python packages, Ollama, curl, nvtop, Gradio, Streamlit, MiniForge, MLFlow Server and more.)    

## Setup 

See ZGX Onboarding Guide @ https://www.hp.com/zgx-onboard

### Prerequisites: 

* HP ZGX is located on same subnet of local network
* VS Code Remote SSH extension is installed on your primary device (non-ZGX device) 

### Installation Steps: 

1. Open VS Code Extension menu
2. Search for "HP ZGX Toolkit"
3. Select "Install" and follow setup instructions

Alternatively, you can install the extension directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HPInc.zgx-toolkit)

### Supported OS on client device, i.e., not the ZGX 

* Windows 11 
* Ubuntu 24.04 
* MacOS 15 

## Questions, issues, feature requests, and contributions 

For help with issues or to submit a feature request please visit the open-source Github repository at https://github.com/HPInc/ZGX-Toolkit

## Data and Telemetry 

The HP ZGX Toolkit collects minimal telemetry data to improve the extension's functionality and user experience. To change your telemetry settings change via [VS Code Telemetry Settings](https://code.visualstudio.com/docs/configure/telemetry)

## Testing

### Quick Test Commands

**Run unit tests:**

```powershell
npm run test:unit
```

**Run integration tests:**

```powershell
npm run test:integration
```

**Run unit tests with coverage:**

```powershell
npm run test:unit:coverage
```

For detailed testing instructions, test structure, and troubleshooting, see the [Testing Guide](docs/testing.md).

### Quick Build Steps

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Build the extension:

   ```powershell
   npm run compile
   ```

3. Add a version (optional):

   ```powershell
   npm version VERSION --no-git-tag-version
   ```

4. Create the `.vsix` package:

   ```powershell
   npx @vscode/vsce package
   ```

5. Install:

   ```powershell
   code --install-extension zgx-toolkit-VERSION.vsix
   ```

6. To un install:

   ```powershell
   code --uninstall-extension hpinc.zgx-toolkit
   ```

## Build Instructions

For comprehensive instructions on building and debugging the extension locally, see the [Building Guide](docs/building.md).
