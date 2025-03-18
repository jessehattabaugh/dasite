# Contributing Guide

## Technologies

Dasite is a Node.js script, it depends on Playwright to load and screenshot pages. It's a CLI that takes a url to a website.

## Testing

Dasite uses Node.js's built-in test runner. Tests focus on real user behavior rather than using mocks or fixtures.

### Test Server

Tests use the `server.js` module which provides a simple express server for testing. The server can be configured with:

- `TEST_SERVER_PORT` - Default is 3000
- `TEST_SERVER_HOST` - Default is localhost

Example:

```bash
# Run tests with custom server configuration
TEST_SERVER_PORT=8080 TEST_SERVER_HOST=127.0.0.1 node index.js
