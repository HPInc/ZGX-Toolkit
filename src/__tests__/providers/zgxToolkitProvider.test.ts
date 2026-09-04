/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as vscode from 'vscode';
import { ZgxToolkitProvider } from '../../providers/zgxToolkitProvider';
import { ViewFactory } from '../../views/viewFactory';
import { MessageRouter } from '../../utils/messageRouter';
import { Logger } from '../../utils/logger';
import { IView } from '../../views/baseViewController';

/**
 * Creates a mock IView instance. Each call returns a fresh mock so callbacks
 * registered on one view instance do not leak into another.
 */
function createMockView(html = '<div>view</div>'): jest.Mocked<IView> {
    return {
        render: jest.fn().mockResolvedValue(html),
        handleMessage: jest.fn().mockResolvedValue(undefined),
        setMessageCallback: jest.fn(),
        setNavigationCallback: jest.fn(),
        setRefreshCallback: jest.fn(),
        dispose: jest.fn()
    };
}

/**
 * Creates a fake vscode.Webview-like object, capturing the message handler
 * registered via onDidReceiveMessage so tests can invoke it directly.
 */
function createFakeWebview() {
    let messageHandler: (message: any) => any = () => undefined;
    const webview: any = {
        options: undefined,
        html: '',
        cspSource: 'vscode-resource:',
        asWebviewUri: jest.fn((uri: any) => ({ toString: () => `webview-uri:${uri?.fsPath ?? uri}` })),
        postMessage: jest.fn(),
        onDidReceiveMessage: jest.fn((cb: any) => {
            messageHandler = cb;
            return { dispose: jest.fn() };
        })
    };
    return {
        webview,
        triggerMessage: (msg: any) => messageHandler(msg)
    };
}

/**
 * Creates a fake vscode.WebviewView-like object for the sidebar.
 */
function createFakeWebviewView() {
    const fakeWebview = createFakeWebview();
    let visibilityHandler: () => void = () => undefined;
    let disposeHandler: () => void = () => undefined;
    const webviewView: any = {
        webview: fakeWebview.webview,
        visible: true,
        show: jest.fn(),
        onDidChangeVisibility: jest.fn((cb: any) => {
            visibilityHandler = cb;
            return { dispose: jest.fn() };
        }),
        onDidDispose: jest.fn((cb: any) => {
            disposeHandler = cb;
            return { dispose: jest.fn() };
        })
    };
    return {
        webviewView,
        webview: fakeWebview.webview,
        triggerMessage: fakeWebview.triggerMessage,
        triggerVisibilityChange: () => visibilityHandler(),
        triggerDispose: () => disposeHandler()
    };
}

/**
 * Creates a fake vscode.WebviewPanel-like object for the editor panel.
 */
function createFakeWebviewPanel() {
    const fakeWebview = createFakeWebview();
    let disposeHandler: () => void = () => undefined;
    const panel: any = {
        webview: fakeWebview.webview,
        iconPath: undefined,
        reveal: jest.fn(),
        dispose: jest.fn(),
        onDidDispose: jest.fn((cb: any) => {
            disposeHandler = cb;
            return { dispose: jest.fn() };
        })
    };
    return {
        panel,
        webview: fakeWebview.webview,
        triggerMessage: fakeWebview.triggerMessage,
        triggerDispose: () => disposeHandler()
    };
}

describe('ZgxToolkitProvider', () => {
    let provider: ZgxToolkitProvider;
    let mockContext: vscode.ExtensionContext;
    let mockViewFactory: jest.Mocked<ViewFactory>;
    let mockMessageRouter: jest.Mocked<MessageRouter>;
    let mockLogger: jest.Mocked<Logger>;
    let views: jest.Mocked<IView>[];
    let failViewId: string | undefined;
    let currentPanel: ReturnType<typeof createFakeWebviewPanel>;

    beforeEach(() => {
        views = [];
        failViewId = undefined;

        mockContext = {
            subscriptions: [],
            extensionUri: { fsPath: '/mock/extension/path' } as any
        } as unknown as vscode.ExtensionContext;

        mockViewFactory = {
            create: jest.fn().mockImplementation((viewId: string) => {
                if (viewId === failViewId) {
                    throw new Error(`Failed to create view: ${viewId}`);
                }
                const view = createMockView();
                views.push(view);
                return view;
            })
        } as unknown as jest.Mocked<ViewFactory>;

        mockMessageRouter = {
            validateMessage: jest.fn().mockReturnValue(true),
            routeMessage: jest.fn().mockResolvedValue(undefined)
        } as unknown as jest.Mocked<MessageRouter>;

        mockLogger = {
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        currentPanel = createFakeWebviewPanel();
        (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => currentPanel.panel);

        provider = new ZgxToolkitProvider(mockContext, mockViewFactory, mockMessageRouter, mockLogger);
    });

    describe('constructor', () => {
        it('generates a nonce and logs initialization', () => {
            expect(mockLogger.debug).toHaveBeenCalledWith('Provider initialized');
        });
    });

    describe('resolveWebviewView', () => {
        it('configures the webview and loads the initial sidebar view', async () => {
            const fake = createFakeWebviewView();

            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            expect(fake.webview.options).toEqual(
                expect.objectContaining({ enableScripts: true })
            );
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
            expect(views[0].render).toHaveBeenCalled();
            expect(fake.webview.html).toContain('<div>view</div>');
            expect(mockLogger.info).toHaveBeenCalledWith('Resolving sidebar webview');
            expect(mockLogger.info).toHaveBeenCalledWith('Sidebar webview resolved successfully');
        });

        it('refreshes the sidebar when it becomes visible again', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            const createCallsBefore = mockViewFactory.create.mock.calls.length;
            fake.webviewView.visible = true;
            fake.triggerVisibilityChange();
            // Allow the fire-and-forget navigateSidebar().catch() chain to settle.
            await Promise.resolve();
            await Promise.resolve();

            expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar became visible');
            expect(mockViewFactory.create.mock.calls.length).toBeGreaterThan(createCallsBefore);
        });

        it('does not refresh the sidebar when it is not visible', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            const createCallsBefore = mockViewFactory.create.mock.calls.length;
            fake.webviewView.visible = false;
            fake.triggerVisibilityChange();
            await Promise.resolve();

            expect(mockLogger.debug).not.toHaveBeenCalledWith('Sidebar became visible');
            expect(mockViewFactory.create.mock.calls.length).toBe(createCallsBefore);
        });

        it('logs an error when the visibility-triggered refresh fails entirely', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            // Force both the real view and the error view creation to fail, and force
            // the "Failed to show error view" log call itself to throw, so the rejection
            // propagates out of navigateSidebar and reaches the visibility handler's catch.
            mockViewFactory.create.mockImplementation(() => {
                throw new Error('boom');
            });
            mockLogger.error.mockImplementation((message: string) => {
                if (message === 'Failed to show error view') {
                    throw new Error('logger failure');
                }
            });

            fake.webviewView.visible = true;
            fake.triggerVisibilityChange();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to refresh sidebar view on visibility change',
                expect.objectContaining({ error: expect.any(Error) })
            );
        });

        it('disposes the sidebar view and clears state when the webview is disposed', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            const currentView = views[views.length - 1];
            fake.triggerDispose();

            expect(currentView.dispose).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar webview disposed');
            expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar disposed');
        });

        it('routes a navigate message with panel "editor" to openInEditor', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            await fake.triggerMessage({ type: 'navigate', targetView: 'devices/manager', panel: 'editor' });

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/manager');
        });

        it('routes a navigate message without an editor panel target through the sidebar', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            await fake.triggerMessage({ type: 'navigate', targetView: 'devices/manager' });

            expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/manager');
        });

        it('routes a non-navigate message to the message router for the current view', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            const currentView = views[views.length - 1];
            await fake.triggerMessage({ type: 'refresh' });

            expect(mockMessageRouter.validateMessage).toHaveBeenCalled();
            expect(mockMessageRouter.routeMessage).toHaveBeenCalledWith({ type: 'refresh' }, currentView);
        });

        it('ignores an invalid message and logs a warning', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            mockMessageRouter.validateMessage.mockReturnValueOnce(false);
            await fake.triggerMessage({ bogus: true });

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Invalid message received',
                expect.objectContaining({ target: 'sidebar' })
            );
            expect(mockMessageRouter.routeMessage).not.toHaveBeenCalled();
        });

        it('shows an error view when message routing throws', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            mockMessageRouter.routeMessage.mockRejectedValueOnce(new Error('route failed'));
            await fake.triggerMessage({ type: 'refresh' });

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Message handling failed',
                expect.objectContaining({ target: 'sidebar' })
            );
            expect(mockViewFactory.create).toHaveBeenCalledWith('common/error');
        });

        it('shows an error view when sidebar navigation fails', async () => {
            const fake = createFakeWebviewView();
            failViewId = 'devices/list';
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Sidebar navigation failed',
                expect.objectContaining({ viewId: 'devices/list' })
            );
            expect(mockViewFactory.create).toHaveBeenCalledWith('common/error');
            expect(fake.webview.html).toContain('<div>view</div>');
        });

        it('falls back to simple error HTML when the error view itself fails to render', async () => {
            const fake = createFakeWebviewView();
            failViewId = 'devices/list';
            mockViewFactory.create.mockImplementation((viewId: string) => {
                throw new Error(`Failed to create view: ${viewId}`);
            });

            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to show error view',
                expect.objectContaining({ target: 'sidebar' })
            );
            expect(fake.webview.html).toContain('Error');
            expect(fake.webview.html).toContain('Failed to create view');
        });
    });

    describe('openInEditor', () => {
        it('creates a new editor panel and navigates to the requested view', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            await provider.openInEditor('devices/manager', { foo: 'bar' });

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'zgxToolkitEditor',
                'ZTK Device Manager',
                vscode.ViewColumn.One,
                expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true })
            );
            expect(currentPanel.panel.iconPath).toEqual(
                expect.objectContaining({ dark: expect.anything(), light: expect.anything() })
            );
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/manager');
            expect(currentPanel.webview.html).toContain('<div>view</div>');
        });

        it('defaults to the devices/manager view when no viewId is provided', async () => {
            await provider.openInEditor();

            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/manager');
        });

        it('reveals and navigates the existing panel on subsequent calls', async () => {
            await provider.openInEditor('devices/manager');
            (vscode.window.createWebviewPanel as jest.Mock).mockClear();
            mockViewFactory.create.mockClear();

            await provider.openInEditor('devices/list');

            expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
            expect(currentPanel.panel.reveal).toHaveBeenCalled();
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
        });

        it('disposes the editor view and clears state when the panel is disposed', async () => {
            await provider.openInEditor('devices/manager');
            const currentView = views[views.length - 1];

            currentPanel.triggerDispose();

            expect(currentView.dispose).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith('Editor panel disposed');
        });

        it('shows an error view when editor navigation fails', async () => {
            failViewId = 'devices/manager';

            await provider.openInEditor('devices/manager');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Editor panel navigation failed',
                expect.objectContaining({ viewId: 'devices/manager' })
            );
            expect(mockViewFactory.create).toHaveBeenCalledWith('common/error');
        });

        describe('editor panel message handling', () => {
            it('navigates within the editor for a navigate message targeting the editor panel', async () => {
                await provider.openInEditor('devices/manager');
                mockViewFactory.create.mockClear();

                await currentPanel.triggerMessage({ type: 'navigate', targetView: 'devices/list', panel: 'editor' });

                expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
            });

            it('navigates within the editor for a navigate message with no panel specified', async () => {
                await provider.openInEditor('devices/manager');
                mockViewFactory.create.mockClear();

                await currentPanel.triggerMessage({ type: 'navigate', targetView: 'devices/list' });

                expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
            });

            it('routes a navigate message targeting the sidebar through the sidebar navigation path', async () => {
                const fake = createFakeWebviewView();
                await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);
                await provider.openInEditor('devices/manager');
                mockViewFactory.create.mockClear();

                await currentPanel.triggerMessage({ type: 'navigate', targetView: 'devices/list', panel: 'sidebar' });

                expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
                expect(fake.webview.html).toContain('<div>view</div>');
            });

            it('routes a non-navigate message to the message router for the editor view', async () => {
                await provider.openInEditor('devices/manager');
                const currentView = views[views.length - 1];

                await currentPanel.triggerMessage({ type: 'refresh' });

                expect(mockMessageRouter.routeMessage).toHaveBeenCalledWith({ type: 'refresh' }, currentView);
            });
        });
    });

    describe('navigation callbacks registered on views', () => {
        it('opens the editor panel when a sidebar view requests editor navigation and no panel exists', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            const sidebarView = views[views.length - 1];
            const navigationCallback = sidebarView.setNavigationCallback.mock.calls[0][0];

            await navigationCallback('devices/manager', undefined, 'editor');

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/manager');
        });

        it('navigates directly in the editor panel when it already exists', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);
            await provider.openInEditor('devices/manager');

            const sidebarView = views.find(v => v.setNavigationCallback.mock.calls.length > 0)!;
            const navigationCallback = sidebarView.setNavigationCallback.mock.calls[0][0];
            (vscode.window.createWebviewPanel as jest.Mock).mockClear();
            mockViewFactory.create.mockClear();

            await navigationCallback('devices/list', undefined, 'editor');

            expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
        });

        it('propagates messages sent by a view through its message callback', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            const sidebarView = views[views.length - 1];
            const messageCallback = sidebarView.setMessageCallback.mock.calls[0][0];

            messageCallback({ type: 'ping' });

            expect(fake.webview.postMessage).toHaveBeenCalledWith({ type: 'ping' });
        });

        it('re-renders the sidebar HTML through the refresh callback', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            const sidebarView = views[views.length - 1];
            const refreshCallback = sidebarView.setRefreshCallback.mock.calls[0][0];
            (sidebarView.render as jest.Mock).mockResolvedValueOnce('<div>refreshed</div>');

            await refreshCallback({ some: 'param' });

            expect(fake.webview.html).toContain('<div>refreshed</div>');
        });

        it('re-renders the editor HTML through the refresh callback', async () => {
            await provider.openInEditor('devices/manager');

            const editorView = views[views.length - 1];
            const refreshCallback = editorView.setRefreshCallback.mock.calls[0][0];
            (editorView.render as jest.Mock).mockResolvedValueOnce('<div>editor refreshed</div>');

            await refreshCallback({ some: 'param' });

            expect(currentPanel.webview.html).toContain('<div>editor refreshed</div>');
        });

        it('propagates messages sent by the editor view through its message callback', async () => {
            await provider.openInEditor('devices/manager');

            const editorView = views[views.length - 1];
            const messageCallback = editorView.setMessageCallback.mock.calls[0][0];

            messageCallback({ type: 'pong' });

            expect(currentPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'pong' });
        });

        it('navigates the sidebar when the editor view requests sidebar navigation', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);
            await provider.openInEditor('devices/manager');
            mockViewFactory.create.mockClear();

            const editorView = views[views.length - 1];
            const navigationCallback = editorView.setNavigationCallback.mock.calls[0][0];

            await navigationCallback('devices/list', undefined, 'sidebar');

            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
            expect(fake.webview.html).toContain('<div>view</div>');
        });

        it('navigates the editor when the editor view requests navigation with no explicit panel', async () => {
            await provider.openInEditor('devices/manager');
            mockViewFactory.create.mockClear();

            const editorView = views[views.length - 1];
            const navigationCallback = editorView.setNavigationCallback.mock.calls[0][0];

            await navigationCallback('devices/list');

            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
            expect(currentPanel.webview.html).toContain('<div>view</div>');
        });
    });

    describe('refreshSidebar / refreshEditor / showSidebar', () => {
        it('refreshes the sidebar when a view is active', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);
            mockViewFactory.create.mockClear();

            await provider.refreshSidebar();

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Refreshing sidebar view',
                expect.objectContaining({ viewId: 'devices/list' })
            );
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/list');
        });

        it('does nothing when refreshing the sidebar without an active view', async () => {
            await provider.refreshSidebar();

            expect(mockViewFactory.create).not.toHaveBeenCalled();
        });

        it('refreshes the editor panel when a view is active', async () => {
            await provider.openInEditor('devices/manager');
            mockViewFactory.create.mockClear();

            await provider.refreshEditor();

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Refreshing editor panel view',
                expect.objectContaining({ viewId: 'devices/manager' })
            );
            expect(mockViewFactory.create).toHaveBeenCalledWith('devices/manager');
        });

        it('does nothing when refreshing the editor without an active view', async () => {
            await provider.refreshEditor();

            expect(mockViewFactory.create).not.toHaveBeenCalled();
        });

        it('shows the sidebar view when it exists', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);

            provider.showSidebar();

            expect(fake.webviewView.show).toHaveBeenCalledWith(true);
            expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar shown');
        });

        it('does nothing when showing the sidebar before it has been resolved', () => {
            expect(() => provider.showSidebar()).not.toThrow();
        });
    });

    describe('dispose', () => {
        it('disposes the sidebar view only when no editor panel exists', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);
            const sidebarView = views[views.length - 1];

            provider.dispose();

            expect(sidebarView.dispose).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith('Provider fully disposed');
        });

        it('disposes both the sidebar and editor panel when both exist', async () => {
            const fake = createFakeWebviewView();
            await provider.resolveWebviewView(fake.webviewView, {} as any, {} as any);
            await provider.openInEditor('devices/manager');

            provider.dispose();

            expect(currentPanel.panel.dispose).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith('Editor panel disposed');
        });
    });

    describe('private helper edge cases', () => {
        it('injectResourceUris returns the original params when no webview is available', () => {
            const result = (provider as any).injectResourceUris({ a: 1 });
            expect(result).toEqual({ a: 1 });
        });

        it('injectResourceUris returns an empty object when no params or webview are available', () => {
            const result = (provider as any).injectResourceUris();
            expect(result).toEqual({});
        });

        it('getFullHtml omits the codicon stylesheet link when no webview is provided', () => {
            const html: string = (provider as any).getFullHtml('<p>body</p>');
            expect(html).toContain('<p>body</p>');
            expect(html).not.toContain('rel="stylesheet"');
        });

        it('navigateEditor logs a warning and does nothing when no editor panel exists', async () => {
            await (provider as any).navigateEditor('devices/manager');

            expect(mockLogger.warn).toHaveBeenCalledWith('Cannot navigate editor panel: panel does not exist');
            expect(mockViewFactory.create).not.toHaveBeenCalled();
        });

        it('handleMessage warns when there is no current view to handle a non-navigate message', async () => {
            await (provider as any).handleMessage({ type: 'refresh' }, 'sidebar');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'No current view to handle message',
                expect.objectContaining({ type: 'refresh', target: 'sidebar' })
            );
            expect(mockMessageRouter.routeMessage).not.toHaveBeenCalled();
        });
    });
});
