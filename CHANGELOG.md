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
