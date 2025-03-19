# DaSite Testing Strategy

## Overview

DaSite uses the Node.js built-in test runner for all tests. The testing approach focuses on real-world behavior and integration tests over unit tests, ensuring the application works as expected from an end-user perspective.

## Testing Approach

### Test Utilities Location

All test utilities are exported from `tests/index.js`:

- Test cleanup functions (cleanScreenshots, cleanSnapshots, cleanup)
- Test runner helpers (runCrawlTest)
- Common paths and constants
- Server exports

Example of proper imports:

```javascript
import {
    cleanScreenshots,
    cleanSnapshots,
    runCrawlTest,
    cliPath,
    dasiteDir,
    startServer,
    stopServer
} from './index.js';
```

### No Test Utils Pattern

We do not use separate test utility modules. Instead:

- Common test functionality is exported from index.js
- Test server content is defined in server.js routes
- Each test file imports what it needs from the main module

### Integration Testing

Our tests are primarily integration tests that:

- Start a real test server
- Execute the CLI with various parameters
- Verify the expected output files and console messages

This approach tests the entire workflow from CLI input to file output, ensuring everything works together.

### Test Output Location

**IMPORTANT:** All test output files MUST be saved in the `/dasite` project root directory. This includes:

- Screenshots
- Baseline images
- Comparison results
- HTML reports

DO NOT create separate output directories like `/output`, `/test-output`, etc. Tests should clean up after themselves by removing any generated files from the `/dasite` directory when complete.

### Test Server Management

The test server is configured in server.js and provides:

- Multiple linked pages for crawl testing
- Pages that change content for comparison testing
- Dynamic elements like random colors and layouts
- Cookie-based state management

For proper test server handling, import the server functions from tests/index.js:

```javascript
import { startServer, stopServer } from './index.js';

describe('My Test Suite', () => {
  let serverInfo;
  const testId = 'unique-test-id';

  before(async () => {
    serverInfo = await startServer({ id: testId });
    // Store serverInfo.url for test use
  });

  after(async () => {
    await stopServer(testId);
  });

  // Test cases...
});
```

### No Mocks Policy

We prefer not to use mocks. Instead, we:

- Create real browser sessions
- Take real screenshots
- Perform real file operations

This ensures tests accurately represent user behavior.

## Test Naming Convention

Tests follow a descriptive naming convention with emoji prefixes indicating functionality:

- 🖼️ Screenshot tests
- 🕸️ Crawling tests
- 📸 Baseline tests
- ⚖️ Comparison tests

## Test Coverage Areas

### Screenshot Tests

- Basic screenshot capture
- Error handling for invalid URLs
- CLI interface behavior

### Crawl Tests

- Full site crawling (default behavior)
- Skipping crawl with --no-crawl flag
- External link handling
- Handling of pages with few or no links

### Baseline Tests

- Accepting snapshots as baselines
- Managing baseline versions
- Pruning old baselines
- Team sharing of baselines

### Comparison Tests

- Detecting visual changes
- Generating diff images
- Creating HTML reports and heatmaps
- Threshold-based failure detection
- Default comparison behavior (automatic unless --no-compare flag is used)

## Running Tests

```bash
# Run all tests
npm test

# Run tests for specific feature
node --test tests/screenshot.test.js

# Run with custom server configuration
TEST_SERVER_PORT=8080 npm test
```

## Adding New Tests

When adding new tests:

1. Place tests in the appropriate feature file
2. Use descriptive test names with emoji prefixes
3. Clean up resources before and after tests
4. Include both success and error cases
5. Define test content in server.js routes instead of static files
6. Import needed functions from index.js, not utility modules
7. All test output must be saved to the `/dasite` directory
