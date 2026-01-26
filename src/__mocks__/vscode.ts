/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

// Mock implementation of the VS Code API for unit testing
export   const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  };

  export const window = {
    createOutputChannel: jest.fn().mockReturnValue({
      appendLine: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    }),
    showInformationMessage: jest.fn().mockResolvedValue('OK'),
    showErrorMessage: jest.fn().mockResolvedValue('OK'),
    showWarningMessage: jest.fn().mockResolvedValue('OK'),
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    createWebviewPanel: jest.fn(),
    registerWebviewViewProvider: jest.fn(),
  };

export const commands = {
  registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  executeCommand: jest.fn().mockResolvedValue(undefined),
};

export const workspace = {
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn().mockReturnValue(undefined), // Return undefined so it falls back to environment
  }),
  fs: {
    stat: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
};

export const env = {
  clipboard: {
    writeText: jest.fn(),
  },
  isTelemetryEnabled: true,
  onDidChangeTelemetryEnabled: jest.fn().mockReturnValue({ dispose: jest.fn() }),
};

export const extensions = {
  getExtension: jest.fn().mockReturnValue({
    isActive: true,
    activate: jest.fn(),
  }),
};

export const Uri = {
  file: jest.fn().mockImplementation((path: string) => ({ fsPath: path })),
  parse: jest.fn().mockImplementation((uri: string) => ({ toString: () => uri })),
  joinPath: jest.fn().mockImplementation((uri: any, ...pathSegments: string[]) => ({
    fsPath: `${uri.fsPath}/${pathSegments.join('/')}`,
    toString: () => `${uri.fsPath}/${pathSegments.join('/')}`
  })),
};

export const ViewColumn = {
  One: 1,
  Two: 2,
  Three: 3,
};

export const CancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: jest.fn(),
};

export const WebviewViewResolveContext = {};

// Mock ExtensionContext
export const mockExtensionContext = {
  subscriptions: [] as any[],
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
  },
  globalState: {
    get: jest.fn().mockReturnValue([]),
    update: jest.fn(),
  },
  extensionPath: '/mock/extension/path',
  extensionUri: Uri.file('/mock/extension/path'),
  storagePath: '/mock/storage/path',
  globalStoragePath: '/mock/global/storage/path',
  logPath: '/mock/log/path',
  secrets: {
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
    onDidChange: jest.fn(),
  },
  environmentVariableCollection: {
    persistent: false,
    replace: jest.fn(),
    append: jest.fn(),
    prepend: jest.fn(),
    get: jest.fn(),
    forEach: jest.fn(),
    clear: jest.fn(),
    delete: jest.fn(),
  },
  asAbsolutePath: jest.fn().mockImplementation((relativePath: string) => `/mock/extension/path/${relativePath}`),
  storageUri: Uri.file('/mock/storage'),
  globalStorageUri: Uri.file('/mock/global/storage'),
  logUri: Uri.file('/mock/log'),
  extensionMode: 1, // ExtensionMode.Development
};