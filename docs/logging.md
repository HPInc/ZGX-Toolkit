# ZGX Toolkit Logging

The ZGX Toolkit extension maintains detailed logs to help troubleshoot connection issues, device discovery problems, and application installation errors.

## Accessing Logs

There are two ways to access the extension logs:

### Method 1: Open Log File Directly

1. Open the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS)
2. Type and select: **ZGX Toolkit: Open Log File**
3. The log file will open in a new editor tab

### Method 2: View Log File Location

1. Open the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS)
2. Type and select: **ZGX Toolkit: Show Log File Location**
3. A message will appear showing the log file path with options to:
   - **Open Log**: Opens the log file directly
   - **Copy Path**: Copies the file path to your clipboard

## Log File Location

The log file is stored in a dedicated directory in your user profile:

- **Windows**: `%USERPROFILE%\.zgx-toolkit\logs\zgx-toolkit.log`
- **macOS**: `~/.zgx-toolkit/logs/zgx-toolkit.log`
- **Linux**: `~/.zgx-toolkit/logs/zgx-toolkit.log`

This location is **persistent across VS Code sessions**, meaning all logs are written to the same file regardless of how many times you restart VS Code.

## Log File Features

### Automatic Rotation

The log file is automatically rotated when it exceeds 30MB in size:

- The current log is renamed to `zgx-toolkit.log.old`
- A new `zgx-toolkit.log` file is created
- Only the current and one backup file are kept

### Log Format

Each log entry includes:

- **ISO Timestamp**: Precise date and time in ISO 8601 format
- **Message**: Description of the event or error

Example:

```text
[2025-10-01T14:30:15.123Z] ZGX Toolkit extension initialized
[2025-10-01T14:30:20.456Z] Starting device discovery...
[2025-10-01T14:30:22.789Z] Discovery completed, found 2 device(s)
```

## What's Logged

The extension logs the following events:

- **Extension initialization and shutdown**
- **Device discovery operations** (start, completion, errors)
- **SSH connection attempts and results**
- **SSH key generation and copying**
- **Application installation progress and errors**
- **device configuration changes**
- **Error messages and stack traces**

## Troubleshooting with Logs

When reporting issues or troubleshooting:

1. **Reproduce the issue** while the extension is running
2. **Open the log file** immediately after the issue occurs
3. **Search for error messages** or the relevant operation
4. **Share relevant log excerpts** when reporting bugs (remove any sensitive information like IP addresses or usernames if needed)

## Privacy Note

The log file may contain:

- Device hostnames and IP addresses
- Usernames
- File paths
- Command outputs

Review the log file before sharing it publicly and redact any sensitive information.
