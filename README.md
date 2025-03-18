# DaSite

The website testing tool that vibes with your development process.

## Overview

DaSite is a command-line tool that helps you test websites by capturing screenshots, crawling sites, and comparing changes over time. It's designed to integrate seamlessly with your development workflow.

## Features

- **Screenshot pages** - Capture visual state of web pages
- **Crawl websites** - Automatically discover and test all pages on a domain
- **Compare changes** - Track visual differences between test runs

## Installation

```bash
npm install -g dasite
# or use it directly
npx dasite http://example.com
```

## Usage

Basic screenshot of a single page:

```bash
dasite http://example.com
```

Crawl an entire site:

```bash
dasite --crawl http://example.com
# or
dasite -c http://example.com
```

Compare with baseline:

```bash
dasite --compare http://example.com
```

## Roadmap

1. **Screenshot a page:** ✅ Visit URLs and save screenshots using Playwright
2. **Crawl the site:** ✅ Discover and capture all pages on the same domain
3. **Record Baselines:** ✅ Save and manage reference screenshots for comparison

4. **Visual Regression Testing:**
   - Compare screenshots to previous baselines
   - Generate visual diffs highlighting pixel-level changes
   - Create HTML reports showing before/after comparisons

5. **Testing Framework:**
   - Fail builds when changes exceed thresholds
   - Integrate with CI/CD pipelines
   - Support for test configuration files

6. **Performance Analysis:**
   - Capture core web vitals and Lighthouse metrics
   - Track performance changes over time
   - Generate performance trend reports

7. **Enhanced Testing:**
   - Accessibility testing and reporting
   - Security vulnerability scanning
   - SEO compliance checking

8. **Advanced Features:**
   - Multi-browser testing (Chrome, Firefox, Safari)
   - Responsive design testing at various viewport sizes
   - API for programmatic usage in test suites
