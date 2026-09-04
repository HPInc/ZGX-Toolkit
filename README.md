# HP Z Toolkit

## Overview 

The HP Z Toolkit streamlines AI development workflows on HP Z devices by providing automated setup of essential open-source AI tools and seamless device discovery on your LAN. This VS Code extension enables developers to quickly configure their Z device environment for model fine-tuning and local inference, while solving common network connectivity challenges. 

## About the HP Z Toolkit 

The HP Z Toolkit addresses two critical pain points for AI developers working with HP Z hardware. First, it provides an automated installation and management system for a curated open-source AI development stack, eliminating hours of manual configuration and dependency resolution. With a single command through the VS Code interface, developers can install and configure Python packages to support model finetuning, experiment tracking and inference, as well as other AI development tools - all optimized for your Z device's ARM and AMD64 architecture and Blackwell GPU. With the Z Toolkit, package dependencies are a thing of the past. 

Second, the toolkit includes lightweight IP discovery functionality that will attempt to automatically locate your device whether setting up for the first time or when DHCP assigns new IP addresses. This eliminates the frustration of broken SSH connections after router reboots or network changes, saving developers 5-10 minutes of troubleshooting each time their device's IP changes. 

![HP Z Toolkit Diagram](/docs/marketplace/images/zgx-tk-extension-diagram.png)

## Quick Start 

1. Install the HP Z Toolkit extension from the VS Code Marketplace 
2. Go to the Device Manager and run the device discovery command to locate your device on the network 
3. Connect to your Z device via the extension's SSH integration and have the Toolkit create SSH keys for you. 
4. Select and install desired components from the curated AI stack (Python packages, Ollama, curl, nvtop, Gradio, Streamlit, MiniForge, MLFlow Server and more.)    

## Setup 

See ZTK Onboarding Guide @ https://www.hp.com/zgx-onboard

### Prerequisites: 

* Your HP Z device is located on same subnet of local network
* VS Code Remote SSH extension is installed on your primary device (non-Z device) 

### Installation Steps: 

1. Open VS Code Extension menu
2. Search for "HP Z Toolkit"
3. Select "Install" and follow setup instructions

Alternatively, you can install the extension directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HPInc.zgx-toolkit)

### Supported Devices:
HP Z Toolkit is designed for supported HP Z AI development systems, including NVIDIA GB10 and GB300-based systems. Device capabilities may vary by system.

### Supported OS on client device, i.e., not the Z device

* Windows 11 
* Ubuntu 24.04 
* MacOS 15 

![Pair Devices Diagram](/docs/marketplace/images/pair-devices-diagram.png)

## Questions, issues, feature requests, and contributions 

For help with issues or to submit a feature request please visit the open-source Github repository at https://github.com/HPInc/ZGX-Toolkit

## Data and Telemetry 

The HP Z Toolkit collects minimal telemetry data to improve the extension's functionality and user experience. To change your telemetry settings change via [VS Code Telemetry Settings](https://code.visualstudio.com/docs/configure/telemetry)
