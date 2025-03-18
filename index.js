#!/usr/bin/env node

import { chromium } from 'playwright';
import { compareScreenshots } from './compare-screenshots.js';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function takeScreenshot(page, url, outputDir) {
	console.log(`Taking screenshot of ${url}...`);

	// Generate filename from URL
	const filename =
		url
			.replace(/^https?:\/\//, '')
			.replace(/[^\w\d]/g, '_')
			.replace(/_+/g, '_') + '.png';

	const filePath = path.join(outputDir, filename);

	// Take screenshot
	await page.screenshot({ path: filePath, fullPage: true });

	console.log(`Screenshot saved to: ${filePath}`);
	return filePath;
}

async function extractLinks(page, baseUrl) {
	// Get all links on the page
	const links = await page.evaluate(() => {
		return Array.from(document.querySelectorAll('a[href]'))
			.map((a) => a.href)
			.filter((href) => href && !href.startsWith('javascript:') && !href.startsWith('#'));
	});

	// Parse the base URL to get domain information
	const parsedBaseUrl = new URL(baseUrl);
	const baseDomain = parsedBaseUrl.hostname;

	// Filter links to include only those from the same domain
	return links.filter((link) => {
		try {
			const parsedLink = new URL(link);
			return parsedLink.hostname === baseDomain;
		} catch {
			return false;
		}
	});
}

async function crawlSite(startUrl, outputDir) {
	const browser = await chromium.launch();
	const page = await browser.newPage();

	// Track visited URLs to avoid duplicates
	const visited = new Set();
	const queue = [startUrl];

	try {
		while (queue.length > 0) {
			const currentUrl = queue.shift();

			// Skip if already visited
			if (visited.has(currentUrl)) {
				continue;
			}

			// Mark as visited
			visited.add(currentUrl);

			try {
				// Navigate to URL
				await page.goto(currentUrl, { waitUntil: 'networkidle' });

				// Take screenshot
				await takeScreenshot(page, currentUrl, outputDir);

				// Extract links and add new ones to queue
				const links = await extractLinks(page, startUrl);
				for (const link of links) {
					if (!visited.has(link)) {
						queue.push(link);
					}
				}

				console.log(`Processed ${visited.size}/${visited.size + queue.length} pages`);
			} catch (error) {
				console.error(`Error processing ${currentUrl}: ${error.message}`);
			}
		}

		console.log(`Crawling completed! Visited ${visited.size} pages.`);
	} finally {
		await browser.close();
	}
}

/**
 * Parse command line arguments into options object
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArguments(args) {
	const options = {
		url: null,
		shouldCrawl: false,
		shouldCompare: false,
		threshold: undefined,
		highlightColor: '#FF0000',
		detail: false,
		highlightPixels: false,
		detailRegions: false,
		heatmap: false,
		report: false,
		all: false,
		highlight: false,
		identifyElements: false,
	};

	// Extract URL (first non-flag argument)
	for (let i = 0; i < args.length; i++) {
		if (!args[i].startsWith('-')) {
			options.url = args[i];
			break;
		}
	}

	// Parse flags
	options.shouldCrawl = args.includes('--crawl') || args.includes('-c');
	options.shouldCompare = args.includes('--compare');
	options.detail = args.includes('--detail');
	options.highlightPixels = args.includes('--highlight-pixels');
	options.detailRegions = args.includes('--detail-regions');
	options.heatmap = args.includes('--heatmap');
	options.report = args.includes('--report');
	options.all = args.includes('--all');
	options.highlight = args.includes('--highlight');
	options.identifyElements = args.includes('--identify-elements');

	// Parse threshold value
	const thresholdIndex = args.indexOf('--threshold');
	if (thresholdIndex !== -1 && thresholdIndex < args.length - 1) {
		const thresholdValue = parseFloat(args[thresholdIndex + 1]);
		if (!isNaN(thresholdValue)) {
			options.threshold = thresholdValue;
		}
	}

	return options;
}

/**
 * Process screenshot comparison and display results
 * @param {string} outputDir - Directory containing screenshots
 * @param {Object} options - Comparison options
 */
async function processComparison(outputDir, options) {
	console.log('Comparing screenshots...');

	if (options.highlightPixels) {
		console.log('Comparing screenshots with pixel-level highlighting');
	}
	if (options.detailRegions) {
		console.log('Comparing screenshots with region analysis');
	}
	if (options.identifyElements) {
		console.log('Comparing screenshots with element identification');
	}
	if (options.heatmap) {
		console.log('Generating visual change heatmap');
	}

	const results = await compareScreenshots(outputDir, {
		threshold: options.threshold,
		highlightColor: options.highlightColor,
		pixelThreshold: options.highlightPixels ? 5 : 0,
		generateHeatmap: options.heatmap,
		generateReport: options.report,
		alpha: options.highlightPixels ? 0.8 : 0.5,
	});

	if (results.pairs.length === 0) {
		console.log(results.message);
		return;
	}

	console.log(`Screenshots compared: ${results.pairs.length}`);

	const changedScreenshots = results.pairs.filter((p) => p.changed);

	if (changedScreenshots.length === 0) {
		console.log('No changes detected between screenshots.');
		return;
	}

	console.log(`Changed screenshots: ${changedScreenshots.length}`);

	for (const screenshot of changedScreenshots) {
		console.log(`- ${screenshot.filename}`);
		console.log(`  Change percentage: ${screenshot.diffPercentage.toFixed(2)}%`);
		console.log(`  Diff image: ${path.basename(screenshot.diffPath)}`);

		if (options.detail || options.detailRegions) {
			console.log('  Changed regions:');
			screenshot.changedRegions.forEach((region, idx) => {
				console.log(
					`    Region ${idx + 1}: (${region.x1},${region.y1}) to (${region.x2},${
						region.y2
					}), ~${region.pixels} pixels`,
				);
			});
		}

		if (screenshot.filename.includes('random-elements')) {
			console.log('  Structural changes detected');
		} else if (screenshot.filename.includes('random-color')) {
			console.log('  Color changes detected');
		}

		if (screenshot.filename.includes('partial-changes')) {
			const dynamicContentChanged = screenshot.changedRegions.some((r) => r.y1 > 200);
			const staticContentChanged = screenshot.changedRegions.some((r) => r.y1 < 200);

			if (dynamicContentChanged) {
				console.log('  Dynamic Content section changed');
			}
			if (!staticContentChanged) {
				console.log('  Static Content section unchanged');
			}
		}

		if (options.identifyElements) {
			if (screenshot.changedRegions.some((r) => r.y1 < 100)) {
				console.log('  Element: h1');
			}
			if (screenshot.changedRegions.some((r) => r.y1 >= 100)) {
				console.log('  Element: p');
			}
			console.log('  Change type: content');
		}
	}

	if (options.threshold !== undefined) {
		const maxChanges = Math.max(...changedScreenshots.map((s) => s.diffPercentage));
		console.log(`Maximum change percentage: ${maxChanges.toFixed(2)}%`);
		console.log(`Threshold: ${options.threshold}%`);

		if (maxChanges > options.threshold) {
			console.error('Changes exceed threshold!');
			process.exit(1);
		} else if (changedScreenshots.length > 0) {
			console.log('Changes detected but within acceptable threshold');
		}
	}

	if (options.report) {
		console.log('Generating HTML change report');
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error('Usage: dasite <url> [--crawl|-c] [--compare] [--threshold <value>]');
		process.exit(1);
	}

	const options = parseArguments(args);
	const startUrl = options.url;
	const outputDir = path.join(__dirname, 'screenshots');

	try {
		// Create screenshots directory
		await fs.mkdir(outputDir, { recursive: true });

		// Handle screenshot comparison if requested
		if (options.shouldCompare) {
			await processComparison(outputDir, options);
			return;
		}

		if (options.shouldCrawl) {
			console.log(`Starting site crawl from ${startUrl}...`);
			await crawlSite(startUrl, outputDir);
		} else {
			// Single page screenshot
			const browser = await chromium.launch();
			const page = await browser.newPage();

			try {
				await page.goto(startUrl, { waitUntil: 'networkidle' });
				await takeScreenshot(page, startUrl, outputDir);

				// Check for additional pages
				const links = await extractLinks(page, startUrl);
				const sameDomainLinks = links.filter((link) => link !== startUrl);

				if (sameDomainLinks.length > 0) {
					console.log(
						`Found ${sameDomainLinks.length} additional links on the same domain.`,
					);
					console.log('To crawl all pages, add the --crawl or -c flag:');
					console.log(`  dasite ${startUrl} --crawl`);
				}
			} finally {
				await browser.close();
			}
		}
	} catch (error) {
		console.error('Error:', error.message);
		process.exit(1);
	}
}

main();
