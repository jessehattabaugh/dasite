#!/usr/bin/env node

import { chromium } from 'playwright';
import { compareScreenshots } from './compare-screenshots.js';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get the snapshot directory for a given test type
 * @param {string} testType - Type of test (playwright, lighthouse, axe, etc)
 */
async function getSnapshotDir(testType) {
  const baseDir = path.join(__dirname, 'dasite', 'snapshots', testType);
  await fs.mkdir(baseDir, { recursive: true });
  return baseDir;
}

/**
 * Takes a screenshot of a webpage
 * @param {import('playwright').Page} page - The Playwright page
 * @param {string} url - The URL to screenshot
 * @returns {Promise<string>} - The path to the saved screenshot
 */
async function takeScreenshot(page, url) {
	console.log(`Taking screenshot of ${url}...`);

	// Generate directory name from URL - normalize URL to remove query parameters
	const parsedUrl = new URL(url);
	// Remove query parameters when generating directory name to ensure consistent naming
	const urlForFilename = `${parsedUrl.hostname}${parsedUrl.pathname}`;

	// Create a directory name from the URL
	const dirName = urlForFilename
		.replace(/^https?:\/\//, '')
		.replace(/[^\w\d]/g, '_')
		.replace(/_+/g, '_');

	// Create URL-specific directory inside dasite directory
	const dasiteDir = path.join(__dirname, 'dasite');
	const urlDir = path.join(dasiteDir, dirName);

	await fs.mkdir(dasiteDir, { recursive: true });
	await fs.mkdir(urlDir, { recursive: true });

	// Use a consistent filename pattern within the URL directory
	const filePath = path.join(urlDir, 'current.png');

	// Take screenshot
	await page.screenshot({ path: filePath, fullPage: true });

	console.log(`Screenshot saved to: ${filePath}`);
	return filePath;
}

/**
 * Extract links from a page with the same domain
 * @param {import('playwright').Page} page - The Playwright page
 * @param {string} baseUrl - The base URL to compare against
 * @returns {Promise<string[]>} - Array of same-domain URLs
 */
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

/**
 * Crawls a website and takes screenshots of each page
 * @param {string} startUrl - The starting URL
 */
async function crawlSite(startUrl) {
	const browser = await chromium.launch();
	const context = await browser.newContext({
		// Preserve cookies when crawling
		acceptDownloads: true,
		storageState: {}, // Initialize empty state to store cookies
	});
	const page = await context.newPage();

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
				await takeScreenshot(page, currentUrl);

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
 * Accept current snapshots as baselines
 * @param {string} testType - Type of test (playwright, lighthouse, axe, etc)
 * @returns {Promise<number>} - Number of accepted snapshots
 */
async function acceptSnapshots(testType = 'playwright') {
	console.log(`Accepting current ${testType} snapshots as baselines...`);
	let accepted = 0;

	try {
		// Check snapshots directory first (traditional approach)
		const snapshotsDir = path.join(__dirname, 'dasite', 'snapshots', testType);
		await fs.mkdir(snapshotsDir, { recursive: true });

		const files = await fs.readdir(snapshotsDir);
		const tmpScreenshots = files.filter((file) => file.endsWith('.tmp.png'));

		if (tmpScreenshots.length > 0) {
			for (const tmpFile of tmpScreenshots) {
				const sourcePath = path.join(snapshotsDir, tmpFile);
				const targetPath = path.join(snapshotsDir, tmpFile.replace('.tmp.png', '.png'));
				await fs.copyFile(sourcePath, targetPath);
				accepted++;
			}
		} else {
			// Also check for current.png files in URL directories
			const dasiteDir = path.join(__dirname, 'dasite');

			try {
				const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
				const directories = entries
					.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
					.map((entry) => entry.name);

				for (const dir of directories) {
					const urlDir = path.join(dasiteDir, dir);
					const currentPath = path.join(urlDir, 'current.png');
					const baselinePath = path.join(urlDir, 'baseline.png');

					try {
						await fs.access(currentPath);
						await fs.copyFile(currentPath, baselinePath);
						accepted++;
					} catch (err) {
						// Skip if file doesn't exist
					}
				}
			} catch (err) {
				// Handle case where dasite directory doesn't exist or can't be read
			}
		}

		// Print the appropriate message based on results
		if (accepted > 0) {
			console.log(`Accepted ${accepted} snapshots as new baselines.`);
		} else {
			console.log('No snapshots found to accept as baselines.');
		}

		return accepted;
	} catch (error) {
		console.error('Error accepting snapshots:', error.message);
		return 0;
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error('Usage: dasite <url> [--crawl|-c] [--accept] [--compare]');
		process.exit(1);
	}

	// Parse flags
	const shouldCrawl = args.includes('--crawl') || args.includes('-c');
	const shouldAccept = args.includes('--accept');
	const shouldCompare = args.includes('--compare');
	const shouldAcceptAllTests = args.includes('--all-tests');

	try {
		if (shouldAccept) {
			// Accept current snapshots as baselines
			if (shouldAcceptAllTests) {
				const testTypes = ['playwright', 'lighthouse', 'axe'];
				let totalAccepted = 0;
				for (const type of testTypes) {
					const accepted = await acceptSnapshots(type);
					totalAccepted += accepted;
				}
			} else {
				await acceptSnapshots('playwright');
			}
			return;
		}

		if (shouldCompare) {
			console.log('Comparing screenshots...');
			const results = await compareScreenshots();
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

		// Handle URL-based commands
		if (args[0] && !args[0].startsWith('--')) {
			const url = args[0];

			if (shouldCrawl) {
				console.log(`Starting site crawl from ${url}...`);
				await crawlSite(url);
			} else {
				// Single page screenshot
				const browser = await chromium.launch();
				// Use a context that preserves cookies
				const context = await browser.newContext({
					acceptDownloads: true,
				});
				const page = await context.newPage();

				try {
					await page.goto(url, { waitUntil: 'networkidle' });
					await takeScreenshot(page, url);

					// Check for additional pages
					const links = await extractLinks(page, url);
					const sameDomainLinks = links.filter((link) => link !== url);

					if (sameDomainLinks.length > 0) {
						console.log(
							`Found ${sameDomainLinks.length} additional links on the same domain.`,
						);
						console.log('To crawl all pages, add the --crawl or -c flag:');
						console.log(`  dasite ${url} --crawl`);
					}
				} finally {
					await browser.close();
				}
			}
			return;
		}
	} catch (error) {
		console.error('Error:', error.message);
		process.exit(1);
	}
}

main();
