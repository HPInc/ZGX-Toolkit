# ZGX Toolkit VS Code Extension

## Documentation

This directory contains comprehensive documentation for the ZGX Toolkit VS Code Extension.

## Available Documentation

- **[Building Guide](building.md)** - Complete guide on building the extension locally, including prerequisites, dependencies, testing, and debugging
- **[Testing Guide](testing.md)** - Complete guide on running unit and integration tests locally
- **[Logging Guide](logging.md)** - How to access and use extension logs for troubleshooting

## Quick Start Testing

```bash
# Install dependencies
npm install

# Run unit tests
npm run test:unit

# Run unit tests with coverage
npm run test:unit:coverage

# Run integration tests (requires VS Code)
npm run test:integration

# Run all checks
npm run compile && npm run lint && npm run test:unit
```

## Test Coverage Areas

The test suite covers:

- ✅ Extension activation/deactivation
- ✅ device CRUD operations (Create, Read, Update, Delete)
- ✅ SSH key generation and command building
- ✅ Webview HTML generation
- ✅ Data persistence and state management
- ✅ Command registration and execution
- ✅ VS Code API integration

## CI/CD Integration

Tests are automatically executed in GitHub Actions on:

- Push to main/develop branches
- Pull requests

### GitHub Release Publishing

The workflow automatically publishes new releases when changes are pushed to the main branch:

- **Version Management**: Automatically increments patch version (e.g., v1.0.0 → v1.0.1)
- **Main Branch Only**: Releases are only created for pushes to the main branch
- **Automatic Tagging**: Creates git tags and GitHub releases
- **Extension Packaging**: Builds and attaches the .vsix file to releases
- **Release Notes**: Automatically generates release notes from commit history

For other branches, the extension is built and tested but not published to releases.

View the latest test results and releases in the [Actions tab](../../actions).

## Contributing

Please ensure all tests pass before submitting pull requests:

1. Write unit tests for new functionality
2. Update integration tests for user-facing changes
3. Maintain test coverage above 80%
4. Follow existing test patterns and conventions

For detailed testing instructions, see the [Testing Guide](testing.md).
