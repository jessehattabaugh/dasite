# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 3/28/2025 - 4:00PM

### [1.3.0] Visual Regression Testing (Roadmap Task #4 ✅)

- Added pixel-by-pixel image comparison functionality
- Added support for generating visual diffs with highlighted changes
- Added HTML comparison report generation
- Added heatmap generation for visualizing change intensity
- Added region detection to identify specific areas of change
- Added threshold-based comparison with customizable sensitivity
- Added support for crawl mode comparison across multiple pages

## [1.2.0] - 3/28/2025 - 3:15PM

### [1.2.0] Site crawling testing

- Enhanced test server with multiple interconnected pages
- Added comprehensive test cases for site crawling feature
- Tests for both `--crawl` and `-c` CLI flags
- Test verification for same-domain crawling behavior
- Test validation for external link exclusion during crawls

## [1.1.0] - 3/27/2025 - 5:00PM

### [1.1.0] Screenshot functionality and testing

- Basic CLI structure for taking screenshots of webpages
- Test server implementation with configurable host and port
- Screenshot functionality using Playwright
- Tests for CLI screenshot capabilities
- Support for TEST_SERVER_PORT and TEST_SERVER_HOST environment variables
- Initial test suite using Node.js built-in test runner

## [1.0.0] - 3/27/2025 - 4:20PM

### [1.0.0] Added

- Initial project setup
- Core functionality implementation
- Basic user interface components
- Documentation
- Testing framework
