# View Architecture Documentation

## Overview

This document describes the view architecture implemented in Phase 3.1 of the ZGX Toolkit rewrite. The architecture provides a clean, testable, and maintainable way to build webview-based UIs in VS Code.

## Architecture Principles

1. **Separation of Concerns**: Views handle presentation, services handle business logic
2. **Dependency Injection**: Views receive dependencies through constructors
3. **Observable State**: Views react to state changes through the store
4. **Type Safety**: Full TypeScript support with discriminated unions for messages
5. **Testability**: All components are designed to be easily unit tested

## Core Components

### BaseView

The `BaseView` abstract class provides common functionality for all views:

```typescript
export abstract class BaseView implements IView {
    abstract render(params?: any): Promise<string>;
    async handleMessage(message: Message): Promise<void>;
    dispose(): void;
    
    // Template rendering
    protected loadTemplate(relativePath: string): string;
    protected renderTemplate(template: string, data: any): string;
    protected wrapHtml(html: string): string;
}
```

**Key Features:**
- Template loading from filesystem
- Handlebars template rendering
- Automatic style and script wrapping
- Message handling with logging
- Resource cleanup on dispose

### IView Interface

All views must implement the `IView` interface:

```typescript
export interface IView {
    render(params?: any): Promise<string>;
    handleMessage(message: Message): Promise<void>;
    dispose(): void;
}
```

### ViewFactory

The `ViewFactory` creates view instances with dependency injection:

```typescript
const factory = new ViewFactory(logger, telemetry, dependencies);
factory.register('devices/list', DeviceListView);
const view = factory.create('devices/list');
```

**Features:**
- Central registry of available views
- Automatic dependency injection
- View lifecycle management
- Type-safe view creation

### MessageRouter

The `MessageRouter` handles routing messages from the webview to the current view:

```typescript
const router = new MessageRouter(logger);
await router.routeMessage(message, currentView);
```

**Features:**
- Type-safe message routing
- Error handling and logging
- Message validation
- Null-safe view handling

## View Structure

Each view consists of four files organized in a directory:

```
views/
  {domain}/
    {view-name}/
      {view-name}View.ts    # TypeScript view class
      {view-name}.html      # HTML template
      {view-name}.css       # Styles
      {view-name}.js        # Client-side JavaScript
```

### Example: device List View

```
views/
  devices/
    list/
      deviceListView.ts   # DeviceListView class
      deviceList.html     # Template
      deviceList.css      # Styles
      deviceList.js       # Client script
```

## Creating a New View

### Step 1: Create the Directory Structure

```
mkdir -p src/views/domain/viewname
```

### Step 2: Create the HTML Template

`viewname.html`:
```html
<div class="container">
    <h2>{{title}}</h2>
    
    {{#if items}}
    <ul class="list">
        {{#each items}}
        <li class="list-item">{{name}}</li>
        {{/each}}
    </ul>
    {{/if}}
    
    {{#if noItems}}
    <div class="empty-state">
        <p>No items found</p>
    </div>
    {{/if}}
</div>
```

### Step 3: Create the Styles

`viewname.css`:
```css
.container {
    padding: var(--spacing-md);
}

.list-item {
    padding: var(--spacing-sm);
    border-bottom: 1px solid var(--vscode-panel-border);
}
```

### Step 4: Create Client-Side Script

`viewname.js`:
```javascript
(function() {
    const vscode = acquireVsCodeApi();
    
    document.getElementById('my-button').addEventListener('click', () => {
        vscode.postMessage({ type: 'my-action' });
    });
})();
```

### Step 5: Create the View Class

`viewnameView.ts`:
```typescript
import { BaseView } from '../../baseView';
import { Logger } from '../../../utils/logger';
import { ITelemetryService } from '../../../types/telemetry';
import { Message } from '../../../types/messages';

export class ViewNameView extends BaseView {
    constructor(deps: { 
        logger: Logger; 
        telemetry: ITelemetryService;
        // Add other dependencies
    }) {
        super(deps.logger, deps.telemetry);
        
        this.template = this.loadTemplate('./viewname.html');
        this.styles = this.loadTemplate('../common.css') + '\n' 
                    + this.loadTemplate('./viewname.css');
        this.clientScript = this.loadTemplate('./viewname.js');
    }

    async render(params?: any): Promise<string> {
        this.logger.debug('Rendering view');
        
        const data = {
            title: 'My View',
            items: this.getItems(),
            noItems: this.getItems().length === 0
        };
        
        const html = this.renderTemplate(this.template, data);
        return this.wrapHtml(html);
    }

    async handleMessage(message: Message): Promise<void> {
        await super.handleMessage(message);
        
        switch (message.type) {
            case 'my-action':
                await this.handleMyAction();
                break;
        }
    }

    private async handleMyAction(): Promise<void> {
        this.logger.info('Handling action');
        // Implementation
    }

    private getItems(): any[] {
        // Implementation
        return [];
    }
}
```

### Step 6: Register the View

Update `viewFactory.ts`:
```typescript
import { ViewNameView } from '../domain/viewname/viewnameView';

private registerViews(): void {
    this.register('domain/viewname', ViewNameView);
    // ... other views
}
```

## Template Syntax

### Variables

```html
<p>{{variableName}}</p>
```

### Conditionals

```html
{{#if condition}}
<p>This is shown when condition is truthy</p>
{{/if}}
```

### Iteration

```html
{{#each items}}
<li>{{name}} - {{value}}</li>
{{/each}}
```

### Nested Data

Templates support dot notation for nested values:
```html
<p>{{user.name}}</p>
<p>{{address.city}}</p>
```

## Common Styles

All views have access to common CSS variables and utilities defined in `common.css`:

### CSS Variables
- Spacing: `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`
- Border radius: `--border-radius`, `--border-radius-sm`, `--border-radius-lg`
- Transitions: `--transition-fast`, `--transition-normal`, `--transition-slow`

### Utility Classes
- Layout: `.container`, `.flex-row`, `.flex-col`, `.grid`
- Buttons: `.btn`, `.btn-secondary`, `.btn-danger`, `.btn-sm`, `.btn-lg`
- Typography: `.text-center`, `.text-muted`, `.text-bold`
- Spacing: `.mt-3`, `.mb-2`, `.p-4`, etc.

### Components
- `.card` - Card container
- `.list` / `.list-item` - List styling
- `.empty-state` - Empty state placeholders
- `.spinner` - Loading spinner
- `.alert` - Alert messages

## Message Handling

### Message Types

All messages are defined in `src/types/messages.ts` as discriminated unions:

```typescript
export type Message =
  | NavigateMessage
  | RefreshMessage
  | CreateDeviceMessage
  // ... more message types
```

### Sending Messages from Client

```javascript
vscode.postMessage({
    type: 'navigate',
    targetView: 'devices/details',
    params: { id: '123' }
});
```

### Handling Messages in View

```typescript
async handleMessage(message: Message): Promise<void> {
    await super.handleMessage(message);
    
    switch (message.type) {
        case 'navigate':
            // Typically handled by provider
            break;
        case 'create-device':
            await this.createDevice(message.data);
            break;
    }
}
```

## Dependency Injection

Views receive dependencies through their constructor:

```typescript
constructor(deps: { 
    logger: Logger; 
    telemetry: ITelemetryService;
    deviceStore: IDeviceStore;
    deviceService: IDeviceService;
}) {
    super(deps.logger, deps.telemetry);
    this.deviceStore = deps.deviceStore;
    this.deviceService = deps.deviceService;
}
```

The ViewFactory automatically injects these dependencies when creating views.

## State Management

Views interact with state through stores:

```typescript
// Subscribe to store changes
this.unsubscribe = this.deviceStore.subscribe((devices) => {
    this.logger.debug('devices updated', { count: devices.length });
    // Trigger re-render through provider
});

// Get current state
const devices = this.deviceStore.getAll();
const device = this.deviceStore.get(id);
```

## Lifecycle Management

### View Creation
1. Factory creates view instance
2. Constructor loads templates and injects dependencies
3. View is ready to render

### Rendering
1. Provider calls `view.render(params)`
2. View prepares data from stores/services
3. Template is rendered with data
4. HTML is wrapped with styles and scripts
5. HTML is returned to provider

### Message Handling
1. Webview sends message
2. Provider receives message
3. MessageRouter routes to current view
4. View handles message
5. View may trigger state changes or navigation

### Disposal
1. Provider disposes old view when navigating
2. View cleans up resources (unsubscribe, etc.)
3. View is garbage collected

## Testing

### Unit Testing Views

```typescript
describe('DeviceListView', () => {
    let view: DeviceListView;
    let mockLogger: jest.Mocked<Logger>;
    let mockStore: jest.Mocked<IDeviceStore>;
    
    beforeEach(() => {
        mockLogger = createMockLogger();
        mockStore = createMockStore();
        
        view = new DeviceListView({
            logger: mockLogger,
            telemetry: mockTelemetry,
            deviceStore: mockStore
        });
    });
    
    it('should render device list', async () => {
        mockStore.getAll.mockReturnValue([{
            id: '1',
            name: 'Test device',
            // ...
        }]);
        
        const html = await view.render();
        
        expect(html).toContain('Test device');
    });
    
    it('should handle delete message', async () => {
        await view.handleMessage({
            type: 'delete-device',
            id: '1'
        });
        
        // Verify service was called
    });
});
```

## Best Practices

1. **Keep Views Thin**: Views should only handle presentation logic
2. **Use Services**: Business logic belongs in services, not views
3. **Type Safety**: Always use Message union types, never `any`
4. **Error Handling**: Wrap async operations in try-catch
5. **Logging**: Log important actions at appropriate levels
6. **Telemetry**: Track user interactions for analytics
7. **Accessibility**: Use semantic HTML and ARIA attributes
8. **Responsiveness**: Test views in different sidebar widths
9. **Performance**: Avoid expensive operations in render()
10. **Cleanup**: Always dispose resources in dispose()

## Common Patterns

### Loading State

```typescript
async render(params?: any): Promise<string> {
    if (this.isLoading) {
        return this.wrapHtml('<div class="spinner"></div>');
    }
    // ... normal render
}
```

### Error State

```typescript
async render(params?: any): Promise<string> {
    if (this.error) {
        const errorView = new ErrorView({ logger, telemetry });
        return errorView.render({ message: this.error.message });
    }
    // ... normal render
}
```

### Empty State

```html
{{#if items}}
<!-- Show items -->
{{/if}}

{{#if noItems}}
<div class="empty-state">
    <div class="empty-state-icon">📭</div>
    <p>No items yet</p>
    <button class="btn">Create First Item</button>
</div>
{{/if}}
```

### Reactive Updates

```typescript
constructor(deps) {
    super(deps.logger, deps.telemetry);
    
    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe(() => {
        // Notify provider to re-render
        this.requestRerender();
    });
}

private requestRerender(): void {
    // Send message to provider to trigger re-render
    // This is typically handled by the provider's store subscription
}
```

## Migration from Old Code

When migrating from the old `machineManagerProvider.ts`:

1. **Identify Screens**: Each distinct "screen" becomes a view
2. **Extract HTML**: Move HTML to template files
3. **Extract CSS**: Move styles to CSS files
4. **Extract JS**: Move client scripts to JS files
5. **Create View Class**: Implement BaseView with render() and handleMessage()
6. **Wire Dependencies**: Add required services/stores to constructor
7. **Register View**: Add to ViewFactory
8. **Test**: Write unit tests for the view

## Current Views

### Common Views
- **ErrorView**: Displays error messages with optional retry
- **LoadingView**: Shows loading spinner with message

### device Views
- **DeviceListView**: Sidebar list of devices (`devices/list`)

### Planned Views
- **ManagerView**: Full editor device manager (`devices/manager`)
- **DeviceDetailsView**: Device details and configuration
- **AppManagementView**: Application installation and management

## Future Enhancements

- [ ] Hot reload support for templates during development
- [ ] Template caching for better performance
- [ ] More sophisticated template engine (if needed)
- [ ] View state persistence across reloads
- [ ] Animation support between view transitions
- [ ] View composition (nesting views)
- [ ] Shared components library

## Resources

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code UI Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [CSS Variables Reference](https://code.visualstudio.com/api/references/theme-color)
- [Codicons Reference](https://microsoft.github.io/vscode-codicons/dist/codicon.html)
- [WCAG Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

## Phase 3.4 Enhancements

### Performance Optimizations

The view system includes several performance optimizations implemented in Phase 3.4:

1. **Template Rendering Performance**: The `renderTemplate` method now tracks rendering duration and logs warnings for slow renders (>50ms).

2. **Efficient DOM Updates**: Views should minimize re-renders by only updating when state actually changes.

3. **Helper Functions**: Use the `viewHelpers.ts` module for common operations:
   ```typescript
   import { createPerformanceTimer, debounce, throttle } from '../viewHelpers';
   
   // Measure operation performance
   const timer = createPerformanceTimer(this.logger, 'render');
   // ... do work
   timer.stop();
   
   // Debounce expensive operations
   const debouncedSearch = debounce(this.search, 300);
   
   // Throttle frequent updates
   const throttledUpdate = throttle(this.update, 100);
   ```

### Accessibility Features

All views must follow these accessibility guidelines:

1. **Semantic HTML**: Use proper HTML5 elements (`<nav>`, `<main>`, `<article>`, etc.)

2. **ARIA Labels**: Add descriptive labels for screen readers:
   ```html
   <button aria-label="Delete device named Production Server">
       <i class="codicon codicon-trash" aria-hidden="true"></i>
   </button>
   ```

3. **ARIA Roles**: Use appropriate roles for custom components:
   ```html
   <div role="alert" aria-live="assertive">Error occurred</div>
   <ul role="list" aria-label="List of devices">
       <li role="listitem">...</li>
   </ul>
   ```

4. **Keyboard Navigation**: Ensure all interactive elements are keyboard accessible:
   - Use proper `tabindex` attributes
   - Handle Enter/Space for custom controls
   - Provide visible focus indicators

5. **Focus Management**: Manage focus when navigating between views:
   ```javascript
   // Focus first interactive element when view loads
   document.querySelector('.btn')?.focus();
   ```

6. **Color Contrast**: Use VS Code theme variables to ensure sufficient contrast:
   ```css
   /* Good: Uses theme variables */
   color: var(--vscode-foreground);
   background: var(--vscode-editor-background);
   
   /* Bad: Hard-coded colors may have poor contrast */
   color: #333;
   background: #fff;
   ```

7. **Touch Targets**: Ensure minimum 28px height/width for interactive elements:
   ```css
   .btn {
       min-height: 28px;
       min-width: 28px;
   }
   ```

### View Helpers

The `viewHelpers.ts` module provides utility functions for common operations:

#### Sanitization and Security
```typescript
import { sanitizeHtml, escapeAttribute } from '../viewHelpers';

// Always sanitize user input before rendering
const safeHtml = sanitizeHtml(userInput);
const safeAttr = escapeAttribute(userAttribute);
```

#### Formatting
```typescript
import { formatDeviceName, formatHostAddress, formatTimestamp } from '../viewHelpers';

const displayName = formatDeviceName(device.name, 30);
const hostStr = formatHostAddress(host, username, port);
const timeStr = formatTimestamp(device.createdAt);
```

#### Validation
```typescript
import { isValidIPv4, isValidPort, validateRequiredFields } from '../viewHelpers';

if (!isValidIPv4(host)) {
    throw new Error('Invalid IP address');
}

validateRequiredFields(data, ['name', 'host', 'username']);
```

#### Async Utilities
```typescript
import { retryOperation } from '../viewHelpers';

// Retry failed operations
const result = await retryOperation(
    () => this.service.connect(),
    3,        // max retries
    1000,     // delay between retries
    this.logger
);
```

### Code Consistency

All views must follow these conventions:

1. **Naming**: Use descriptive names following the pattern `{Domain}{View}View` (e.g., `DeviceListView`)

2. **File Organization**: Keep related files together in domain folders:
   ```
   views/
     devices/
       list/
       manager/
       details/
     apps/
       selection/
       install/
   ```

3. **Error Handling**: Always wrap async operations in try-catch:
   ```typescript
   private async handleAction(): Promise<void> {
       try {
           await this.service.doSomething();
           this.logger.info('Action completed');
       } catch (error) {
           this.logger.error('Action failed', { error });
           throw error;
       }
   }
   ```

4. **Logging Levels**:
   - `trace`: Very detailed information (render calls, message routing)
   - `debug`: Detailed information (view creation, state changes)
   - `info`: Important events (user actions, navigation)
   - `warn`: Potential issues (slow renders, validation warnings)
   - `error`: Error conditions (failures, exceptions)

5. **Telemetry Markers**: Add commented telemetry calls for future activation:
   ```typescript
   // TELEMETRY: Track feature usage
   // this.telemetry.trackFeature('device.connect', { id });
   ```

### Testing Guidelines

All views should have comprehensive test coverage:

```typescript
describe('MyView', () => {
    let view: MyView;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;
    
    beforeEach(() => {
        mockLogger = {
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;
        
        mockTelemetry = {
            trackNavigation: jest.fn(),
            trackFeature: jest.fn(),
            trackError: jest.fn(),
        } as any;
        
        view = new MyView({ logger: mockLogger, telemetry: mockTelemetry });
    });
    
    describe('render', () => {
        it('should render view with data', async () => {
            const html = await view.render({ data: 'test' });
            expect(html).toContain('test');
        });
        
        it('should track navigation', async () => {
            await view.render();
            expect(mockTelemetry.trackNavigation).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object)
            );
        });
    });
    
    describe('handleMessage', () => {
        it('should handle action messages', async () => {
            await view.handleMessage({ type: 'my-action' });
            expect(mockLogger.info).toHaveBeenCalled();
        });
    });
    
    describe('dispose', () => {
        it('should clean up resources', () => {
            view.dispose();
            // Verify cleanup
        });
    });
});
```

### Production Readiness Checklist

Before considering a view production-ready, verify:

- [ ] HTML template uses semantic markup
- [ ] All buttons have descriptive `aria-label` attributes
- [ ] Interactive elements have minimum 28px touch targets
- [ ] CSS uses VS Code theme variables (no hard-coded colors)
- [ ] View handles loading states gracefully
- [ ] View handles error states gracefully
- [ ] View handles empty states gracefully
- [ ] All user inputs are sanitized
- [ ] All async operations have error handling
- [ ] View logs important actions
- [ ] Telemetry markers are in place (commented)
- [ ] View has comprehensive unit tests
- [ ] View properly cleans up in dispose()
- [ ] Performance is acceptable (<50ms render time)
- [ ] View is keyboard navigable
- [ ] View works in different VS Code themes
- [ ] Documentation is up to date

