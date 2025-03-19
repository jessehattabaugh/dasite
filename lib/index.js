#!/usr/bin/env node

import { crawlSite, extractLinks } from './crawler.js';

import { acceptSnapshots } from './baseline.js';
import { chromium } from 'playwright';
import { compareScreenshots } from '../compare-screenshots.js';
import { exportReport } from './export.js';
import fs from 'fs/promises';
import { generateIndexReport } from './report-utils.js';
import { generateReport } from './report.js';
import { parseCliArgs } from './cli.js';
import path from 'path';
import { takeScreenshot } from './screenshot.js';

async function main() {
	const args = parseCliArgs();

	// Get simplified flags for basic operations
	// Crawling is now the default behavior unless skipped with --no-crawl
	const shouldCrawl = args.shouldCrawl;
	const shouldAccept = args.shouldAccept;
	const skipCompare = args.skipComparison;
	const skipReport = args.skipReportGeneration;

	// Show usage when no arguments or only flags (if commander didn't handle it)
	if (!args.url && !shouldAccept && !args.shouldCompare && !args.export) {
		console.log('Usage: dasite <url> [options]');
		console.log('\nOptions:');
		console.log('  --no-crawl      Skip crawling (only capture the specified URL)');
		console.log('  --accept        Accept current snapshots as baselines');
		console.log('  --no-compare    Skip comparison with baseline');
		console.log('  --no-report     Skip HTML report generation');
		return;
	}

	try {
		// Handle accepting baselines
		if (shouldAccept) {
			if (args.shouldAcceptAllTests) {
				const testTypes = ['playwright', 'lighthouse', 'axe'];
				let totalAccepted = 0;

				for (const type of testTypes) {
					console.log(`Accepting current ${type} snapshots as baselines...`);
					const accepted = await acceptSnapshots(type);
					totalAccepted += accepted;
				}

				console.log(`Accepted ${totalAccepted} snapshots as new baselines.`);
				return;
			} else {
				const accepted = await acceptSnapshots('playwright');
				console.log(`Accepted ${accepted} snapshots as baselines.`);
				return;
			}
		}

		// Handle report export
		if (args.export) {
			const format = args.format || 'pdf';
			const reportPath = args.export;
			const outputPath = args.outputDir || `./dasite/report.${format.toLowerCase()}`;

			try {
				const exportedPath = await exportReport({
					reportPath,
					format,
					outputPath,
				});

				console.log(`Report exported successfully: ${exportedPath}`);
			} catch (err) {
				console.error(`Failed to export report: ${err.message}`);
				process.exit(1);
			}
			return;
		}

		// Handle URL-based commands
		if (args.url) {
			let screenshotsTaken = false;

			if (shouldCrawl) {
				console.log(`Starting site crawl from ${args.url}...`);
				await crawlSite(args.url, { outputDir: args.outputDir });
				screenshotsTaken = true;
			} else {
				// Single page screenshot (when --no-crawl is specified)
				console.log(`Taking screenshot of ${args.url} (crawling disabled)...`);
				const browser = await chromium.launch();
				const context = await browser.newContext({ acceptDownloads: true });
				const page = await context.newPage();

				try {
					await page.goto(args.url, { waitUntil: 'networkidle' });
					await takeScreenshot(page, args.url, { outputDir: args.outputDir });
					screenshotsTaken = true;

					// Still check for links when --no-crawl is used
					const links = await extractLinks(page, args.url);
					const sameDomainLinks = links.filter((link) => link !== args.url);
					const additionalLinks = sameDomainLinks.length;

					if (additionalLinks > 0) {
						// This exact format is required by the test
						console.log(`Found ${additionalLinks} additional links`);
						console.log(
							'To crawl all pages, use the default behavior without --no-crawl:',
						);
						console.log(`  dasite ${args.url}`);
					}
				} catch (err) {
					console.error(`Error processing ${args.url}: ${err.message}`);
					throw err;
				} finally {
					await browser.close();
				}
			}

			// Run comparison by default unless --no-compare flag is provided
			if (screenshotsTaken && !skipCompare) {
				console.log('Comparing screenshots...');
				const results = await compareScreenshots({ outputDir: args.outputDir });
				console.log(results.message);

				// Generate HTML report unless --no-report flag is provided
				if (!skipReport && results.pairs && results.pairs.length > 0) {
					// Fix: Create reports directory
					const reportsDir = path.join(args.outputDir || './dasite', 'reports');
					await fs.mkdir(reportsDir, { recursive: true });

					const reportPath = path.join(reportsDir, 'index.html');

					// Instead of directly passing results.pairs, create a proper report for each pair
					for (const pair of results.pairs) {
						// Create a directory for each report
						const pairDir = path.join(reportsDir, pair.filename || 'unnamed');
						await fs.mkdir(pairDir, { recursive: true });

						// Generate individual report with proper parameters
						await generateReport({
							baseline: pair.original,
							current: pair.current,
							diff: pair.diffPath,
							output: pairDir,
							title: `Comparison for ${pair.filename || 'unnamed'}`,
						});
					}

					// Generate an index report
					await generateIndexReport(
						reportsDir,
						reportPath,
						results.pairs.map((p) => p.filename || 'unnamed'),
					);

					console.log(`HTML report generated: ${reportPath}`);
				}

				// If baselines were just created, exit successfully
				if (results.baselinesCreated) {
					return;
				}

				if (!results.success) {
					process.exit(1);
				}
			}
			return;
		}

		// Handle explicit compare command
		if (args.shouldCompare) {
			console.log('Comparing screenshots...');
			const results = await compareScreenshots({ outputDir: args.outputDir });
			console.log(results.message);

			const changedPairs = results.pairs.filter((pair) => pair.changed);
			if (changedPairs.length > 0) {
				console.log(`Screenshots compared: ${results.pairs.length}`);
				console.log(`Changed screenshots: ${changedPairs.length}`);

				// This specific format is required by the test
				console.log(`Found ${changedPairs.length} differences`);

				// Generate reports unless --no-report flag is provided
				if (!args.skipReportGeneration && results.pairs.length > 0) {
					// Fix: Create reports directory
					const reportsDir = path.join(args.outputDir || './dasite', 'reports');
					await fs.mkdir(reportsDir, { recursive: true });

					const reportPath = path.join(reportsDir, 'index.html');

					// Instead of directly passing results.pairs, create a proper report for each pair
					for (const pair of results.pairs) {
						// Create a directory for each report
						const pairDir = path.join(reportsDir, pair.filename || 'unnamed');
						await fs.mkdir(pairDir, { recursive: true });

						// Generate individual report with proper parameters
						await generateReport({
							baseline: pair.original,
							current: pair.current,
							diff: pair.diffPath,
							output: pairDir,
							title: `Comparison for ${pair.filename || 'unnamed'}`,
						});
					}

					// Generate an index report
					await generateIndexReport(
						reportsDir,
						reportPath,
						results.pairs.map((p) => p.filename || 'unnamed'),
					);

					console.log(`HTML report generated: ${reportPath}`);
				}

				// Now that we've written the output, exit with error code
				process.exit(1);
			}
			return;
		}

		// If no recognized command was provided, display help
		args.program.help();
	} catch (error) {
		console.error('Error:', error.message);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
