# ZGX File Transfer Reference

> This reference document lists the methods used to transfer files between ZGX and your local workstation using standard SSH-based tools.
> Included is a quick start guide for transferring files using VS Code Remote SSH and some sample commands using standard tools and methods (SCP, SFTP, etc.). For more examples, advanced options, and troubleshooting details, please consult the official documentation links referenced below.

## 1. Official Documentation Reference Links
- VS Code Remote SSH: https://code.visualstudio.com/docs/remote/ssh
- VS Code file operations (general): https://code.visualstudio.com/docs/editor/codebasics
- SSH command basics: https://www.ssh.com/academy/ssh/command
- SCP: https://www.ssh.com/academy/ssh/scp
- SFTP: https://www.ssh.com/academy/ssh/sftp
- rsync: https://download.samba.org/pub/rsync/rsync.html

### *Note: Remote Explorer in VS Code*
- The "Explorer" view in VS Code is a view that shows your folders and files, typically shown as a sidebar/panel on the left side of the screen by default.
- The Explorer view in a VS Code window that is opened on a remote machine is referred to as the "Remote Explorer" view. The folders and files shown here are available on the remote machine only.
- Any step in the guide below that says “Remote Explorer” refers to this view.

## 2. File Transfer Quick Start Guide using VS Code Remote SSH
### Downloading Files (ZGX → Client)
**Single File Download:**
1. In the VS Code Remote Explorer panel, right‑click a file.
2. Select the “Download…” option.
3. Pick a local destination to download the file when prompted.

<br>

**Batch Download Folder:**
1. In the VS Code Remote Explorer panel, right‑click a folder.
2. Select the “Download…” option (VS Code will recursively copy all files in the folder).
3. Pick a local destination to download the folder when prompted.

### Uploading Files (Client → ZGX)
**Drag and Drop:**
1. Open the destination folder in the VS Code Remote Explorer.
2. Drag a file from your local OS file manager into the VS Code Remote Explorer panel.
3. Confirm that the file appears and file size matches.

<br>

**Copy/Paste:**
1. Select a local file and copy it (Ctrl+C).
2. Select/click on the destination folder in the VS Code Remote Explorer.
3. Paste the file (Ctrl+V).

## 3. Terminal Command Examples (SCP/SFTP/rsync)
Please consult the official documentation reference links above for more in-depth instructions:
```
# Execute this command before installing any package 
sudo apt-get update

# Install SCP and SFTP
sudo apt-get install openssh-client

# Download a model from ZGX using SCP
scp zgx-user@zgx.internal:/home/zgx-user/models/best_model.pth .

# Upload a file to ZGX using SCP
scp ./inference.py zgx-user@zgx.internal:/home/zgx-user/projects/demo/

# SFTP session (download and upload)
sftp zgx-user@zgx.internal
sftp> ls
sftp> get best_model.pth
sftp> put new_model.onnx

# Install rsync
sudo apt install rsync

# Sync a folder using rsync (local ← remote)
rsync -avz zgx-user@zgx.internal:/home/zgx-user/models/ ./models_local/
```

## 4. Troubleshooting
- Please consult the official documentation reference links above for transfer file failures, including:
  - File or path permission issues
  - Slow transfer speeds
  - Transfer stalls or partial file transfer
  - File integrity after transfer

- If unresolved, please open an issue in the ZGX Toolkit GitHub repository.
