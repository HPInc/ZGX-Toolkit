# VS Code Workspace Configuration

This folder contains VS Code workspace-specific settings for the ZGX Toolkit extension development.

## Files

### `settings.json`
Workspace settings including:
- **Automatic License Headers**: Configured with psioniq.psi-header extension
- **File Associations**: TypeScript and JavaScript file mappings

### `hp-license.code-snippets`
Manual snippets for license header insertion:
- `hp-license`: Insert just the header
- `hp-license-file`: Insert header with blank line

### `launch.json`
Debug configuration for running the extension

### `tasks.json`
Build and watch tasks for TypeScript compilation

## Automatic License Headers

The workspace is pre-configured to automatically add license headers to new files.

**To enable:**
1. Install the extension: `psioniq.psi-header`
2. Reload VS Code
3. Create a new `.ts`, `.js`, `.css`, or `.html` file
4. Header will be automatically added on save!

**Manual insertion:**
- Press `Ctrl+Alt+H` twice (Windows/Linux)
- Press `Cmd+Alt+H` twice (Mac)

**Supported file types:**
- TypeScript/JavaScript (`.ts`, `.js`, `.tsx`, `.jsx`) - Uses `/* */` comments
- CSS (`.css`) - Uses `/* */` comments
- HTML (`.html`) - Uses `<!-- -->` comments

See `docs/license-headers.md` for complete documentation.

## Extension Recommendations

Consider installing these extensions for the best development experience:
- `psioniq.psi-header` - Automatic license headers
- `ms-vscode-remote.remote-ssh` - Required dependency for extension functionality

## Modifying Settings

To customize the license header template, edit the `psi-header.templates` section in `settings.json`.

To change when headers are automatically inserted, modify the `psi-header.changes-tracking.autoHeader` setting:
- `"autoSave"` - Insert on every save
- `"manualSave"` - Insert when manually saved
- `"off"` - Disable automatic insertion
