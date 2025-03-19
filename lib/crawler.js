import { chromium } from 'playwright';
import { takeScreenshot } from './screenshot.js';

/**
 * Extract links from a page with the same domain
 * @param {import('playwright').Page} page - The Playwright page
 * @param {string} baseUrl - The base URL to compare against
 * @returns {Promise<string[]>} - Array of same-domain URLs
 */
export async function extractLinks(page, baseUrl) {
	// Get all links on the page
	const links = await page.evaluate(() => {
		return Array.from(document.querySelectorAll('a[href]'))
			.map((a) => {
				try {
					// Convert relative URLs to absolute
					return new URL(a.href, window.location.href).toString();
				} catch {
					return null;
				}
			})
			.filter((href) => href && !href.startsWith('javascript:') && !href.startsWith('#'));
	});

	// Parse the base URL to get domain information
	const parsedBaseUrl = new URL(baseUrl);
	const baseDomain = parsedBaseUrl.hostname;

	// Filter links to include only those from the same domain
	const sameDomainLinks = links.filter((link) => {
		try {
			const parsedLink = new URL(link);
			return parsedLink.hostname === baseDomain;
		} catch {
			return false;
		}
	});

	// Return unique links excluding the base URL
	return [...new Set(sameDomainLinks)].filter((link) => link !== baseUrl);
}

/**
 * Crawls a website and takes screenshots of each page
 * @param {string} startUrl - The starting URL
 * @param {Object} options - Crawler options
 * @param {string} [options.outputDir] - Output directory for screenshots
 * @param {boolean} [options.headless=true] - Whether to run browser in headless mode
 * @returns {Promise<{visited: Set<string>, screenshots: string[]}>} - Crawl results
 */
export async function crawlSite(startUrl, options = {}) {
	const { outputDir, headless = true } = options;
	const browser = await chromium.launch({ headless });
	const context = await browser.newContext({
		acceptDownloads: true,
		storageState: {}, // Initialize empty state to store cookies
	});
	const page = await context.newPage();

	// Track visited URLs to avoid duplicates
	const visited = new Set();
	const queue = [startUrl];
	const screenshots = [];

	try {
		console.log(`Starting site crawl from ${startUrl}...`);

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
				const screenshotPath = await takeScreenshot(page, currentUrl, { outputDir });
				screenshots.push(screenshotPath);

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
		return { visited, screenshots };
	} finally {
		await browser.close();
	}
}
