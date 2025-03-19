#!/usr/bin/env node

import { crawlSite, extractLinks } from './lib/crawler.js';

import { acceptSnapshots } from './lib/baseline.js';
import { chromium } from 'playwright';
import { compareScreenshots } from './compare-screenshots.js';
import { exportReport } from './lib/export.js';
import fs from 'fs/promises';
import { generateIndexReport } from './lib/report-utils.js';
import { generateReport } from './lib/report.js';
import { parseCliArgs } from './lib/cli.js';
import path from 'path';
import { takeScreenshot } from './lib/screenshot.js';

async function main() {
	const args = parseCliArgs();

	// Check for parsing errors
	if (args.error) {
		console.error('Error parsing arguments:', args.error.message);
		process.exit(1);
	}

	// Commander will handle --help and --version automatically,
	// so we only need to handle our custom commands

	try {
		// Handle accepting baselines
		if (args.shouldAccept) {
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
				return;
			}
		}

		// Handle comparing screenshots
		if (args.shouldCompare) {
			console.log('Comparing screenshots...');
			const results = await compareScreenshots({ outputDir: args.outputDir });
			console.log(results.message);

			const changedPairs = results.pairs.filter((pair) => pair.changed);
			if (changedPairs.length > 0) {
				console.log(`Screenshots compared: ${results.pairs.length}`);
				console.log(`Changed screenshots: ${changedPairs.length}`);

				// This specific format is required by the test
				process.stdout.write(`Found ${changedPairs.length} differences\n`);

				// Now that we've written the output, exit with error code
				process.exit(1);
			}
			return;
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
			if (args.shouldCrawl) {
				await crawlSite(args.url, { outputDir: args.outputDir });
			} else {
				// Single page screenshot
				const browser = await chromium.launch();
				const context = await browser.newContext({ acceptDownloads: true });
				const page = await context.newPage();

				try {
					await page.goto(args.url, { waitUntil: 'networkidle' });
					await takeScreenshot(page, args.url, { outputDir: args.outputDir });

					// Check for additional pages
					const links = await extractLinks(page, args.url);
					const sameDomainLinks = links.filter((link) => link !== args.url);

					if (sameDomainLinks.length > 0) {
						console.log(
							`Found ${sameDomainLinks.length} additional links on the same domain.`,
						);
						console.log('To crawl all pages, add the --crawl or -c flag:');
						console.log(`  dasite ${args.url} --crawl`);
					}

					// Generate reports unless --no-report is specified
					if (!args.skipReportGeneration) {
						const baselineDir = path.join(args.outputDir, 'baseline');
						const currentDir = path.join(args.outputDir, 'current');
						const reportsDir = path.join(args.outputDir, 'reports');

						try {
							// Create the reports directory if it doesn't exist
							await fs.mkdir(reportsDir, { recursive: true });

							// Check if baseline exists
							const baselineExists = await fs
								.access(baselineDir)
								.then(() => true)
								.catch(() => false);

							if (baselineExists) {
								// Find the screenshot files
								const baselineFiles = await fs.readdir(baselineDir);
								const currentFiles = await fs.readdir(currentDir);

								// Process screenshots for each page
								for (const baselineFile of baselineFiles) {
									if (baselineFile.endsWith('.png')) {
										const pageName = baselineFile;

										// Check if there's a matching current screenshot
										if (currentFiles.includes(pageName)) {
											const baselinePath = path.join(baselineDir, pageName);
											const currentPath = path.join(currentDir, pageName);
											const diffPath = path.join(
												args.outputDir,
												'diff',
												pageName,
											);

											// Generate report for this page
											const pageReportDir = path.join(
												reportsDir,
												pageName.replace('.png', ''),
											);
											await fs.mkdir(pageReportDir, { recursive: true });

											await generateReport({
												baseline: baselinePath,
												current: currentPath,
												diff: diffPath,
												output: pageReportDir,
												title: `Visual Comparison - ${pageName}`,
											});

											console.log(
												`Generated report for ${pageName}: ${path.join(
													pageReportDir,
													'report.html',
												)}`,
											);
										}
									}
								}

								// Generate an index report
								const indexPath = path.join(reportsDir, 'index.html');
								await generateIndexReport(
									reportsDir,
									indexPath,
									baselineFiles.filter((f) => f.endsWith('.png')),
								);

								console.log(`Generated index report: ${indexPath}`);
							}
						} catch (err) {
							console.warn(`Note: Could not auto-generate reports: ${err.message}`);
						}
					} else {
						console.log('Report generation skipped (--no-report specified)');
					}
				} finally {
					await browser.close();
				}
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
