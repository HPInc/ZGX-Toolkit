/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

// Mock implementation of the VS Code API for unit testing
export   const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
};

export const window = {
    createOutputChannel: jest.fn().mockReturnValue({
        appendLine: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    }),
    showInformationMessage: jest.fn().mockResolvedValue('OK'),
    showErrorMessage: jest.fn().mockResolvedValue('OK'),
    showWarningMessage: jest.fn().mockResolvedValue('OK'),
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    createWebviewPanel: jest.fn(),
    registerWebviewViewProvider: jest.fn()
};

export const commands = {
    registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    executeCommand: jest.fn().mockResolvedValue(undefined)
};

export const workspace = {
    getConfiguration: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(undefined) // Return undefined so it falls back to environment
    }),
    fs: {
        stat: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn()
    },
    workspaceFolders: undefined as { uri: { authority: string } }[] | undefined,
    onDidChangeWorkspaceFolders: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    createFileSystemWatcher: jest.fn().mockReturnValue({
        onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        onDidCreate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        onDidDelete: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        dispose: jest.fn()
    })
};

// Minimal mock of vscode.EventEmitter sufficient for unit tests.
export class EventEmitter<T> {
    private readonly listeners: ((value: T) => unknown)[] = [];

    public event = (listener: (value: T) => unknown) => {
        this.listeners.push(listener);
        return { dispose: jest.fn() };
    };

    public fire(value: T): void {
        this.listeners.forEach(listener => listener(value));
    }

    public dispose(): void {
        this.listeners.length = 0;
    }
}

// Minimal mock of vscode.RelativePattern sufficient for unit tests.
export class RelativePattern {
    public readonly base: string;
    public readonly baseUri: unknown;
    public readonly pattern: string;

    // Base/pattern are optional so jest's automock introspection (which instantiates with
    // no arguments) doesn't throw.
    constructor(base?: { fsPath: string } | string, pattern?: string) {
        this.base = typeof base === 'string' ? base : (base?.fsPath ?? '');
        this.baseUri = base;
        this.pattern = pattern ?? '';
    }
}

export const env = {
    clipboard: {
        writeText: jest.fn()
    },
    isTelemetryEnabled: true,
    onDidChangeTelemetryEnabled: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    openExternal: jest.fn().mockResolvedValue(true),
    remoteName: undefined as string | undefined,
    sessionId: 'mock-session-id'
};

export const extensions = {
    getExtension: jest.fn().mockReturnValue({
        isActive: true,
        activate: jest.fn()
    })
};

export const Uri = {
    file: jest.fn().mockImplementation((path: string) => ({ fsPath: path })),
    parse: jest.fn().mockImplementation((uri: string) => ({ toString: () => uri })),
    joinPath: jest.fn().mockImplementation((uri: any, ...pathSegments: string[]) => ({
        fsPath: `${uri.fsPath}/${pathSegments.join('/')}`,
        toString: () => `${uri.fsPath}/${pathSegments.join('/')}`
    }))
};

export const ViewColumn = {
    One: 1,
    Two: 2,
    Three: 3
};

export const ExtensionMode = {
    Production: 1,
    Development: 2,
    Test: 3
};

export const CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn()
};

export const WebviewViewResolveContext = {};

// Mock ExtensionContext
export const mockExtensionContext = {
    subscriptions: [] as any[],
    workspaceState: {
        get: jest.fn(),
        update: jest.fn()
    },
    globalState: {
        get: jest.fn().mockReturnValue([]),
        update: jest.fn()
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
        onDidChange: jest.fn()
    },
    environmentVariableCollection: {
        persistent: false,
        replace: jest.fn(),
        append: jest.fn(),
        prepend: jest.fn(),
        get: jest.fn(),
        forEach: jest.fn(),
        clear: jest.fn(),
        delete: jest.fn()
    },
    asAbsolutePath: jest.fn().mockImplementation((relativePath: string) => `/mock/extension/path/${relativePath}`),
    storageUri: Uri.file('/mock/storage'),
    globalStorageUri: Uri.file('/mock/global/storage'),
    logUri: Uri.file('/mock/log'),
    extensionMode: 2 // ExtensionMode.Development
};