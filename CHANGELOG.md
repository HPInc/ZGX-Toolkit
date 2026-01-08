# Version v1.8.0 → v1.13.3 January 2026

## What's New
This release brings significant improvements to device management and network reliability, along with a new sample project and extensive test coverage enhancements.

## Major Features

### Automatic Device IP Discovery with mDNS
Your ZGX device's IP address may change due to DHCP lease renewals or network reconfiguration. With this release, the ZGX Toolkit can now automatically track and update device IP addresses in the background, so you never lose connectivity.

#### Benefits for you:
- No more manually updating IP addresses when your device moves or your network changes
- Seamless reconnection to devices, even after network disruptions
- Device Manager now shows a "Rediscover Device" button for quick manual updates

#### How it works:
- When you first set up a device with SSH key authentication, the extension registers a unique identifier on your ZGX device using the Avahi mDNS service
- A background updater periodically rediscovers registered devices and updates their IP addresses if they've changed
- If you have existing devices that were set up before this update, you'll see a notification prompting you to complete the mDNS registration

### RAG Sample Application for AI Workflows
A new ready-to-run Retrieval-Augmented Generation (RAG) sample has been added to help you get started with AI development on your ZGX device.
 
#### Benefits for you:
- Jump-start your AI projects with a working example instead of building from scratch
- Learn RAG implementation patterns 
- Develop and test entirely on local hardware with no cloud API costs or data egress fees

#### What's included:
- A complete Python application using Streamlit, Ollama, and LangChain
- In-memory FAISS vector store for document embedding and retrieval
- PDF document ingestion with automatic chunking
- Interactive Q&A interface powered by your local LLM

#### Getting started:
1. Install the required applications on your ZGX device (Ollama, Python/Miniforge)
2. Find the sample at samples/rag.py in the extension source
3. Run with streamlit run rag.py
4. Upload a PDF and start asking questions

This sample demonstrates best practices for building retrieval-augmented AI applications entirely on your local hardware—no cloud services required.

## Quality & Reliability Improvements
- **Expanded test coverage:** Comprehensive new test suites for device services, DNS registration, discovery services, and view controllers
- **Code organization:** Added copyright headers across test files and utility scripts
- **Connection service improvements:** Better handling of DNS service registration with detailed error types and recovery paths
- **Discovery service enhancements:** Improved handling of multiple network interfaces and protocol support (TCP/UDP)
- **Background updater resilience:** Graceful error handling when discovery fails, with automatic retry on next interval

## Upgrade Notes
**Existing devices:** After upgrading, devices set up with SSH key authentication will prompt for mDNS registration. This is optional but recommended for automatic IP tracking.

**No breaking changes:** All existing functionality remains unchanged. The new features are additive and backward-compatible.

# v0.0.47 → v1.7.3 (October 2025 - November 2025)

## Feature Highlights

### Built-in ZGX Network Discovery

Discover HP ZGX devices on your local network automatically using mDNS. No more manually tracking IP addresses or hunting through your network, just run the discovery command from the Device Manager and connect to detected ZGX devices by name. This streamlines first-time setup and makes it easy to reconnect when network configurations change.

### One-Click Application Installation

Install a curated AI development stack on your ZGX device directly from VS Code. Select from Python environments (Miniforge, pip, uv, poetry), container tools (Podman), AI productivity tools (Ollama, MLflow, Streamlit, Open WebUI), and developer utilities (curl, nvtop, nmon). Dependencies are resolved automatically with real-time progress visualization. Get from fresh device to production-ready AI workstation in minutes.

### SSH-Only Authentication (Security First)

Password authentication has been completely removed in favor of SSH key-based authentication. The extension now guides you through generating SSH keys, adding them to your ZGX device, and maintaining secure connections, all from within VS Code. This enterprise-ready approach reduces security risks while simplifying the setup experience.

### Configurable Logging & Telemetry

New granular controls for debugging and diagnostics. Adjust log levels (Error, Warn, Info, Debug, Trace) from the command palette, open or locate log files with one click, and enable/disable extension telemetry independently of VS Code's global settings. Logs now write to both the VS Code output channel and rotating daily files, making field issue troubleshooting significantly easier.

### Open-Source release

The extension source code is now fully available at https://github.com/HPInc/ZGX-Toolkit.

## Developer Experience

### Quick Links Sidebar

Access frequently used resources and documentation instantly with the new Quick Links menu. Jump to the ZGX onboarding guide, GitHub repository, or key documentation without 
leaving your editor.

### Centralized Quick-Start Guides 

Accessible from the quick links sidebar, you can now browse and select quick-start guides through a visual card-based interface. Better organization and clearer visual hierarchy make it easier to find the right starting point for your AI projects.
### Improved Application Selection UI

- Sticky footer navigation: Install, Continue, and action buttons stay visible as you scroll through the app catalog
- Pinned buttons in editor: Quick access to common actions from any view
- Enhanced completion screen: Clearer success states with next-step guidance after installations complete
- Uninstallation support: It is now possible to selectively uninstall applications from the application management screen.
Smarter SSH Workflows
- Non-standard port support: SSH commands now correctly handle custom ports with proper -p flags
- Auto-generated config entries: The extension safely manages your ~/.ssh/config file, creating and maintaining host entries for ZGX devices without overwriting your existing configurations
- Clearer error messages: When Remote-SSH isn't available, you get explicit commands you can copy and run manually

### Accessibility Improvements

Fixed color contrast issues in high-contrast themes (both light and dark variants). Code boxes, text elements, and UI components now meet accessibility standards for users requiring enhanced visual contrast.

### Enhanced Inference & Fine-Tuning Pages

Connect buttons on Inference and Fine-Tuning pages now work reliably. These critical workflows are no longer blocked by connectivity issues.
