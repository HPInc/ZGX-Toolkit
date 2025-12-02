# License Header Automation

This project is configured to **automatically** add license headers to all new TypeScript and JavaScript files. Manual snippets are also available for existing files.

## 🚀 Automatic Header Insertion (Recommended)

### Setup (One-time)

1. Install the **psioniq File Header** extension:
   - Open VS Code Extensions (`Ctrl+Shift+X`)
   - Search for: `psioniq.psi-header`
   - Click Install

2. **That's it!** The workspace is pre-configured in `.vscode/settings.json`

### How It Works

When you create a new `.ts`, `.js`, `.css`, or `.html` file:
1. Create/open a new file
2. Start typing or save the file
3. **Header is automatically added to the top!** ✨

The extension uses the configuration in `.vscode/settings.json` to insert:

**For TypeScript/JavaScript/CSS:**
```javascript
/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */
```

**For HTML:**
```html
<!--
  Copyright ©2025 HP Development Company, L.P.
  Licensed under the X11 License. See LICENSE file in the project root for details.
-->
```

### Manual Insertion (if needed)

If a file doesn't have a header, you can add it manually:
1. Open the file
2. Press `Ctrl+Alt+H` then `Ctrl+Alt+H` again (Windows/Linux)
3. Or `Cmd+Alt+H` then `Cmd+Alt+H` (Mac)

---

## 📝 Manual Snippet Method (Alternative)

If you prefer not to use the extension, use the built-in snippets:

### Method 1: Using the Snippet

1. Open a new or existing TypeScript/JavaScript file
2. At the top of the file, type: `hp-license`
3. Press `Tab` or `Enter` to expand the snippet
4. The license header will be inserted automatically with the current year

### Method 2: Using the Command Palette

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Insert Snippet"
3. Select "HP X11 License Header" or "HP X11 License Header - Full File"

## Available Snippets

### `hp-license`
Inserts just the license header block:
```javascript
/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */
```

### `hp-license-file`
Inserts the license header with a blank line after, positioning the cursor for you to start coding:
```javascript
/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

// Your code starts here
```

## Supported File Types

The license header snippets and automatic insertion work in:
- TypeScript (`.ts`)
- JavaScript (`.js`)
- TypeScript React (`.tsx`)
- JavaScript React (`.jsx`)
- CSS (`.css`)
- HTML (`.html`)

**Header formats:**
- **JS/TS/CSS**: Uses `/* ... */` block comments
- **HTML**: Uses `<!-- ... -->` comment tags

---

## ⚙️ Configuration Details

The automatic header configuration is in `.vscode/settings.json`:

```json
{
  "psi-header.config": {
    "forceToTop": true,        // Always place header at top
    "blankLinesAfter": 1,      // Add blank line after header
    "license": "Custom"
  },
  "psi-header.templates": [
    {
      "language": "*",
      "template": [
        "/*",
        " * Copyright ©<<year>> HP Development Company, L.P.",
        " * Licensed under the X11 License. See LICENSE file in the project root for details.",
        " */"
      ]
    }
  ]
}
```

### Customization Options

You can modify the behavior in `.vscode/settings.json`:
- `forceToTop`: Set to `false` if you don't want headers forced to top
- `blankLinesAfter`: Change number of blank lines after header
- `autoHeader`: When to auto-insert (`autoSave`, `manualSave`, or `off`)

---

## License Information

This project uses the **X11 License** (also known as MIT/X11 variant). The full license text is available in the `LICENSE` file at the project root.

Key points about the X11 License:
- Very permissive open source license
- Similar to MIT but with additional clauses for name usage
- Allows commercial use, modification, distribution
- Requires copyright notice in distributions

---

## 🔧 Troubleshooting

### Header Not Appearing Automatically?

1. **Check extension is installed**: 
   - Go to Extensions (`Ctrl+Shift+X`)
   - Search for "psioniq.psi-header"
   - Should show "Installed"

2. **Reload VS Code**:
   - After installing, reload window: `Ctrl+Shift+P` → "Reload Window"

3. **Manual trigger**:
   - If auto-insert doesn't work, use `Ctrl+Alt+H` + `Ctrl+Alt+H`

4. **Check file type**:
   - Extension works on `.ts`, `.js`, `.tsx`, `.jsx`, `.css`, `.html` files
   - Won't work on `.json`, `.md`, etc.

### Header Inserted in Wrong Place?

- Set `"psi-header.config.forceToTop": true` in settings
- Remove any content before the header
- Save again

### Want to Disable Automatic Insertion?

In `.vscode/settings.json`, change:
```json
{
  "psi-header.changes-tracking": {
    "autoHeader": "off"  // Change from "manualSave" to "off"
  }
}
```

---

## 🎯 Quick Reference

| Action | Method |
|--------|--------|
| **Auto-insert on new files** | Just save the file (if extension installed) |
| **Manual insert** | `Ctrl+Alt+H` + `Ctrl+Alt+H` (or use snippet `hp-license`) |
| **Update year** | Edit manually or re-insert header |
| **Skip header** | Create file without saving, or disable in settings |

---

## Verification

To check if all files have proper license headers, you can run:

```powershell
# Search for files without license headers
Get-ChildItem -Path src -Include *.ts,*.js -Recurse | Where-Object { 
    (Get-Content $_.FullName -TotalCount 3) -notmatch "Copyright.*HP Development Company" 
}
```

If this returns no files, all files have headers! ✅

---

## 📚 Additional Resources

- [psioniq.psi-header Extension](https://marketplace.visualstudio.com/items?itemName=psioniq.psi-header)
- [SPDX X11 License](https://spdx.org/licenses/X11.html)
- [VS Code Snippets Documentation](https://code.visualstudio.com/docs/editor/userdefinedsnippets)
- Project `LICENSE` file (full X11 license text)

---

## Questions?

If you have questions about licensing or header requirements, please refer to:
- `LICENSE` file in project root
- [SPDX X11 License](https://spdx.org/licenses/X11.html)
- HP legal team for specific guidance
