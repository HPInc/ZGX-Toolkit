# Testing Guide for ZGX Toolkit VS Code Extension

This document provides comprehensive guidance on running tests locally for the ZGX Toolkit VS Code Extension.

If not already done so, please follow the quickstart guide and build instructions for the extension **[here](../README.md)**

## Overview

The ZGX Toolkit extension includes two types of tests:

1. **Unit Tests** - Test individual functions and classes in isolation using Jest
2. **Integration Tests** - Test the extension in a real VS Code environment using Mocha

## Prerequisites

- Node.js 18.x or 20.x
- npm 8.x or higher
- VS Code (for integration tests)

## Setup

1. Clone the repository and navigate to the project directory:

```bash
git clone <repository-url>
cd solution-zgx-vscode-extension
```

2. Install dependencies:

```bash
npm install
```

## Running Tests Locally

### Unit Tests

Unit tests use Jest and run quickly in isolation without requiring VS Code.

**Run all unit tests:**

```bash
npm run test:unit
```

**Run unit tests in watch mode (reruns on file changes):**

```bash
npm run test:unit:watch
```

**Run unit tests with coverage report:**

```bash
npm run test:unit:coverage
```

The coverage report will be generated in the `coverage/` directory. Open `coverage/lcov-report/index.html` in a browser to view detailed coverage information.

### Integration Tests

Integration tests run the extension in a real VS Code environment to test end-to-end functionality.

**Run integration tests:**

```bash
npm run test:integration
```

This command will:

1. Compile the TypeScript source
2. Download VS Code (if not already present)
3. Launch VS Code with the extension loaded
4. Execute the integration test suite

**Note:** Integration tests may require a display environment. On headless systems, you might need to use Xvfb:

```bash
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
npm test
```

## Test Structure

### Unit Tests (`src/__tests__/`)

- `extension.test.ts` - Tests for the main extension activation/deactivation
- `machineManagerProvider.test.ts` - Tests for the core device management functionality
- `setup.ts` - Global test configuration and mocks

### Integration Tests (`src/__tests__/`)

- `runIntegrationTest.ts` - Test runner that launches VS Code
- `integrationSuite/index.ts` - Test suite configuration
- `integrationSuite/extension.integration.test.ts` - End-to-end extension tests

### Mock Files (`src/__mocks__/`)

- `vscode.ts` - Mock VS Code API for unit testing

## Test Coverage

Unit tests cover the following areas:

- **Extension Lifecycle**: Activation, deactivation, command registration
- **device CRUD Operations**: Add, edit, delete devices
- **SSH Configuration**: Key generation, command building
- **Webview HTML Generation**: UI template generation
- **Data Persistence**: Saving/loading device configurations

## Writing New Tests

### Unit Tests

Create new unit test files in `src/__tests__/` with the `.test.ts` suffix:

```typescript
import * as vscode from 'vscode';
import { YourClass } from '../yourFile';

describe('YourClass', () => {
  let instance: YourClass;

  beforeEach(() => {
    instance = new YourClass();
  });

  it('should do something', () => {
    const result = instance.doSomething();
    expect(result).toBe('expected');
  });
});
```

### Integration Tests

Add integration tests to `src/__tests__/integrationSuite/` with the `.test.ts` suffix:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Integration Test', () => {
  it('should test VS Code integration', async () => {
    const extension = vscode.extensions.getExtension('zgx-toolkit');
    assert.ok(extension);
    
    // Test extension functionality
  });
});
```

## Debugging Tests

### Unit Tests

Use the built-in Jest debugging capabilities:

```bash
# Debug a specific test file
npm run test:unit -- --testPathPattern=extension.test.ts --runInBand

# Debug with additional logging
npm run test:unit -- --verbose
```

### Integration Tests

Integration tests can be debugged using VS Code's debugger:

1. Open the project in VS Code
2. Go to "Run and Debug" sidebar
3. Select "Extension Tests" from the dropdown
4. Set breakpoints in your test files
5. Press F5 to start debugging

## Continuous Integration

Tests are automatically run in CI/CD pipeline on:

- Push to main/develop branches
- Pull requests

The CI pipeline runs:

1. Linting (`npm run lint`)
2. Compilation (`npm run compile`)
3. Unit tests with coverage (`npm run test:unit:coverage`)
4. Integration tests (`npm run test:integration`)

## Troubleshooting

### Common Issues

**1. "Module 'vscode' not found"**

- This is expected in unit tests - the vscode module is mocked
- Make sure you're using the correct test command

**2. Integration tests fail with display errors**

- Use Xvfb on headless systems
- Ensure VS Code can be downloaded and launched

**3. Tests timeout**

- Increase timeout in test configuration
- Check for infinite loops or blocking operations

**4. Coverage reports missing**

- Ensure all source files are included in coverage configuration
- Check Jest configuration in `jest.config.js`

### Performance Tips

- Run unit tests frequently during development (they're fast)
- Run integration tests less frequently (they're slower)
- Use watch mode for rapid feedback during development
- Focus coverage on critical business logic

## Configuration Files

- `jest.config.js` - Jest unit test configuration
- `tsconfig.json` - TypeScript configuration for production code
- `tsconfig.test.json` - TypeScript configuration for integration tests
- `.eslintrc.js` - ESLint configuration for code quality

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Mocha Documentation](https://mochajs.org/)

## Contributing

When contributing code:

1. Write unit tests for new functionality
2. Update integration tests for user-facing changes
3. Ensure all tests pass locally before submitting PR
4. Add tests for bug fixes to prevent regression
5. Update documentation if test procedures change

Run the full test suite before submitting:

```bash
npm run compile && npm run lint && npm run test:unit && npm run test:integration
```
