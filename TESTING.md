# DaSite Testing Strategy

## Overview

DaSite uses the Node.js built-in test runner for all tests. The testing approach focuses on real-world behavior and integration tests over unit tests, ensuring the application works as expected from an end-user perspective.

## Test Organization

Tests are organized by feature area:

-   `screenshot.test.js` - Tests for basic screenshot functionality
-   `crawl.test.js` - Tests for site crawling functionality
-   `baseline.test.js` - Tests for baseline management (accepting, comparing, versioning)
-   `comparison.test.js` - Tests for screenshot comparison and diff generation

All tests are imported in `main.js` which serves as the entry point when running the full test suite.

## Testing Approach

### Integration Testing

Our tests are primarily integration tests that:

-   Start a real test server
-   Execute the CLI with various parameters
-   Verify the expected output files and console messages

This approach tests the entire workflow from CLI input to file output, ensuring everything works together.

### Test Server

Tests use `server.js` which provides a configurable Express server to simulate different websites with:

-   Multiple linked pages for crawl testing
-   Pages that change content for comparison testing
-   Dynamic elements like random colors and layouts

### No Mocks Policy

We prefer not to use mocks. Instead, we:

-   Create real browser sessions
-   Take real screenshots
-   Perform real file operations

This ensures tests accurately represent user behavior.

## Test Helpers

Common test helper functions include:

-   `cleanScreenshots()` - Removes previous screenshots before tests
-   `cleanSnapshots()` - Cleans baseline directories
-   `startServer()` - Configurable test server that can be modified between test
    runs

## Test Naming Convention

Tests follow a descriptive naming convention with emoji prefixes indicating functionality:

-   🖼️ Screenshot tests
-   🕸️ Crawling tests
-   📸 Baseline tests
-   ⚖️ Comparison tests

## Test Coverage Areas

### Screenshot Tests

-   Basic screenshot capture
-   Error handling for invalid URLs
-   CLI interface behavior

### Crawl Tests

-   Full site crawling
-   External link handling
-   Handling of pages with few or no links

### Baseline Tests

-   Accepting snapshots as baselines
-   Managing baseline versions
-   Pruning old baselines
-   Team sharing of baselines

### Comparison Tests

-   Detecting visual changes
-   Generating diff images
-   Creating HTML reports and heatmaps
-   Threshold-based failure detection

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
5. Verify file outputs and console messages
