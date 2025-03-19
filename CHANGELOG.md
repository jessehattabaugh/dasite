# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 3/30/2025 - 1:30PM

### Changed

- Made crawling the default behavior (removed --crawl/-c flag)c flag)
- Added --no-crawl flag to disable crawling when needed
- Updated documentation to reflect new default behavior- Updated documentation to reflect new default behavior

## [1.3.1] - 3/29/2025 - 10:00AM## [1.3.1] - 3/29/2025 - 10:00AM

### [1.3.1] Changed

- Made screenshot comparison the default behavior (removed need for explicit `--compare` flag) need for explicit `--compare` flag)
- Added `--no-compare` flag to skip comparison when not needed- Added `--no-compare` flag to skip comparison when not needed
- Updated test suite to verify default comparison behaviordefault comparison behavior

## [1.3.0] - 3/28/2025 - 4:00PM

### Added4 ✅)

- Added pixel-by-pixel image comparison functionalityunctionality
- Added support for generating visual diffs with highlighted changesd changes
- Added HTML comparison report generation
- Added heatmap generation for visualizing change intensity
- Added region detection to identify specific areas of change
- Added threshold-based comparison with customizable sensitivity- Added threshold-based comparison with customizable sensitivity
- Added support for crawl mode comparison across multiple pagescomparison across multiple pages

## [1.2.0] - 3/28/2025 - 3:15PM

### Added

- Enhanced test server with multiple interconnected pagesnected pages
- Added comprehensive test cases for site crawling featureature
- Tests for both default crawling behavior and --no-crawl flag
- Test verification for same-domain crawling behavior- Test verification for same-domain crawling behavior
- Test validation for external link exclusion during crawlslink exclusion during crawls

## [1.1.0] - 3/27/2025 - 5:00PM

### Added

- Basic CLI structure for taking screenshots of webpagess of webpages
- Test server implementation with configurable host and portgurable host and port
- Screenshot functionality using Playwright
- Tests for CLI screenshot capabilities
- Support for TEST_SERVER_PORT and TEST_SERVER_HOST environment variables- Support for TEST_SERVER_PORT and TEST_SERVER_HOST environment variables
- Initial test suite using Node.js built-in test runner.js built-in test runner

## [1.0.0] - 3/27/2025 - 4:20PM/2025 - 4:20PM

{
 "default": true,
 "MD013": false,
 "MD030": false,
 "MD024": false
}

- Initial project setup
- Core functionality implementationality implementation
- Basic user interface componentsace components
- Documentation- Documentation

- Testing framework- Testing framework
