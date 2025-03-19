# DaSite

The website testing tool that vibes with your development process.

## Overview

DaSite is a command-line tool that helps you test websites by capturing screenshots, crawling sites, and comparing changes over time. It's designed to integrate seamlessly with your development workflow.

## Features

-   **Screenshot pages** - Capture visual state of web pages
-   **Crawl websites** - Automatically discover and test all pages on a domain
-   **Compare changes** - Track visual differences between test runs

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

HTML reports:

```bash
# Reports are automatically generated when capturing screenshots
dasite http://example.com

# Skip report generation with --no-report
dasite http://example.com --no-report
```

Export report to different formats:

```bash
dasite --export path/to/report.html --format pdf --output path/to/report.pdf
```

## Roadmap

1. **Screenshot a page:** ✅ Visit URLs and save screenshots using Playwright
2. **Crawl the site:** ✅ Discover and capture all pages on the same domain
3. **Record Baselines:** ✅ Save and manage reference screenshots for comparison

4. **Visual Regression Testing:** ✅

    - Compare screenshots to previous baselines
    - Generate visual diffs highlighting pixel-level changes

5. **HTML Report Generation:** ✅

    - Create HTML reports showing before/after comparisons
    - Interactive viewer for visual changes
    - Export reports in different formats
    - Automatic report generation after capturing screenshots
    - Option to skip report generation with --no-report

6. **Configuration:**

    - Support for test configuration parameters
    - output directory, so users can choose where to put the output products
    - visual regression threshold
    - html report generation location
    - commandline arguments, or a config file

7. **Multi-browser testing (Chrome, Firefox, Safari):**

    - extend the visual regression testing (which tests current versus previous snapshots) and compare screenshots between all three browsers (Chrome, Firefox, and Webkit).
    - These are more likely to fail due to the many small indiscrepeancies between the browsers, so they have their own threshold, and diff files.
    - Screenshots for other browsers are also created.
    - User should be able to configure which browsers to use.

8. **Responsive design testing:**

    - test at various viewport sizes
    - defaults to mobile, other options include desktop, and tablet
    - user can configure emulation environments
    - browser is configured to use touch events or not depending on profile
    - should also be capable of testing other responsive media query features like prefers-low-motion, or light/dark mode

9. **Performance Analysis:**

    - Capture core web vitals and Lighthouse metrics
    - Track performance changes over time
    - Generate performance trend reports

10. **Enhanced Testing:**

-   Accessibility testing and reporting
-   Security vulnerability scanning
-   SEO compliance checking
