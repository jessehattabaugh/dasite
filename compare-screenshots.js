#!/usr/bin/env node

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';
// Import ResembleJS correctly - it has different import requirements
import resemble from 'resemblejs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Compare screenshots and generate diff images
 * @param {string} options - Comparison options
 * @returns {Promise<Object>} - Comparison results
 */
export async function compareScreenshots(options = {}) {
	const {
		threshold = 0,
		alpha = 0.5,
		highlightColor = '#FF0000',
		pixelThreshold = 0,
		outputDir = path.join(process.cwd(), 'dasite'),
	} = options;

	const dasiteDir = outputDir;

	try {
		await fs.mkdir(dasiteDir, { recursive: true });
	} catch (err) {
		return {
			pairs: [],
			message: 'No dasite directory found',
		};
	}

	// List all URL directories in the dasite dir
	let entries;
	try {
		entries = await fs.readdir(dasiteDir, { withFileTypes: true });
	} catch (err) {
		return {
			pairs: [],
			message: 'Error reading dasite directory',
		};
	}

	const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

	if (directories.length === 0) {
		return {
			pairs: [],
			message: 'No screenshot directories found',
		};
	}

	const pairs = [];
	let baselineCreationCount = 0;

	// Process each URL directory
	for (const dir of directories) {
		const urlDir = path.join(dasiteDir, dir);
		const currentPath = path.join(urlDir, 'current.png');
		const baselinePath = path.join(urlDir, 'baseline', 'current.png');
		const diffPath = path.join(urlDir, 'diff.png');

		// Ensure baseline directory exists
		await fs.mkdir(path.join(urlDir, 'baseline'), { recursive: true });

		// Check if both current and baseline exist
		let currentExists = false;
		let baselineExists = false;

		try {
			await fs.access(currentPath);
			currentExists = true;
		} catch (err) {
			// Current screenshot doesn't exist
			continue;
		}

		try {
			await fs.access(baselinePath);
			baselineExists = true;
		} catch (err) {
			// Baseline doesn't exist, create it
			await fs.copyFile(currentPath, baselinePath);
			baselineCreationCount++;
			baselineExists = true;
		}

		if (currentExists && baselineExists) {
			// Perform comparison
			const img1 = await fs.readFile(baselinePath);
			const img2 = await fs.readFile(currentPath);

			// Use ResembleJS correctly
			const comparison = await new Promise((resolve) => {
				resemble(img1)
					.compareTo(img2)
					.ignoreAntialiasing()
					.scaleToSameSize()
					.outputSettings({
						errorColor: {
							red: parseInt(highlightColor.substring(1, 3), 16),
							green: parseInt(highlightColor.substring(3, 5), 16),
							blue: parseInt(highlightColor.substring(5, 7), 16),
						},
						errorType: 'movement',
						transparency: alpha,
						largeImageThreshold: 1200,
					})
					.onComplete((data) => {
						resolve(data);
					});
			});

			// Save diff image
			await fs.writeFile(
				diffPath,
				comparison.getBuffer ? comparison.getBuffer() : Buffer.from([]),
			);

			// Extract regions with changes
			const changedRegions = [];
			if (comparison.rawMisMatchPercentage > 0) {
				changedRegions.push({
					x1: 0,
					y1: 0,
					x2: comparison.dimensionDifference?.width || 0,
					y2: comparison.dimensionDifference?.height || 0,
					pixels: Math.floor(
						(comparison.rawMisMatchPercentage *
							(comparison.dimensionDifference?.width || 0) *
							(comparison.dimensionDifference?.height || 0)) /
							100,
					),
				});
			}

			pairs.push({
				urlDir: dir,
				filename: dir,
				original: baselinePath,
				current: currentPath,
				diffPath,
				diffPercentage: comparison.rawMisMatchPercentage,
				changed: comparison.rawMisMatchPercentage > threshold,
				changedRegions,
				analysis: comparison,
			});
		}
	}

	// If we created baselines, return early
	if (baselineCreationCount > 0) {
		return {
			pairs: [],
			message: `Created ${baselineCreationCount} baseline screenshots. Run again to compare with current screenshots.`,
			baselinesCreated: true,
		};
	}

	// Count the changed pairs
	const changedPairs = pairs.filter((pair) => pair.changed);
	let message = `Compared ${pairs.length} screenshots`;

	// Add information about changed screenshots
	if (changedPairs.length > 0) {
		message += `\nFound ${changedPairs.length} differences`;
	} else {
		message += '\nNo changes detected';
	}

	return { pairs, message, changedPairsCount: changedPairs.length };
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
 * @returns {Promise<void>}
 */
async function crawlSite(startUrl) {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const visited = new Set();
	const queue = [startUrl];

	while (queue.length > 0) {
		const currentUrl = queue.shift();
		if (visited.has(currentUrl)) {
			continue;
		}

		console.log(`Visiting: ${currentUrl}`);
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

		visited.add(currentUrl);
	}

	await browser.close();
	console.log(`Crawl completed! Visited ${visited.size} pages.`);
}

/**
 * Generate HTML comparison report
 * @param {Array} results - Comparison results
 * @param {string} outputPath - Path for HTML report
 */
async function generateReport(results, outputPath) {
	const html = `<!DOCTYPE html>
<html>
<head>
  <title>DaSite Screenshot Comparison Report</title>
  <style>
    body { font-family: sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .comparison { margin-bottom: 40px; border-bottom: 1px solid #eee; }
    .images { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .image-container { text-align: center; }
    img { max-width: 100%; border: 1px solid #ccc; }
    .changed { color: #d32f2f; }
    .unchanged { color: #388e3c; }
    .stats { margin: 20px 0; padding: 20px; background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>DaSite Screenshot Comparison Report</h1>
  <div class="stats">
    <h2>Summary</h2>
    <p>Total pages: ${results.length}</p>
    <p>Changed pages: ${results.filter((r) => r.changed).length}</p>
    <p>Unchanged pages: ${results.filter((r) => !r.changed).length}</p>
  </div>
  ${results
		.map(
			(result) => `
    <div class="comparison">
      <h3 class="${result.changed ? 'changed' : 'unchanged'}">
        ${result.filename}
        ${result.changed ? `(${result.diffPercentage.toFixed(2)}% changed)` : '(unchanged)'}
      </h3>
      <div class="images">
        <div class="image-container">
          <h4>Before</h4>
          <img src="${path.basename(result.original)}" alt="Original">
        </div>
        <div class="image-container">
          <h4>After</4>
          <img src="${path.basename(result.current)}" alt="Current">
        </div>
        ${
			result.changed
				? `
          <div class="image-container">
            <h4>Diff</h4>
            <img src="${path.basename(result.diffPath)}" alt="Diff">
          </div>
        `
				: ''
		}
      </div>
      ${
			result.changed && result.changedRegions?.length > 0
				? `
        <div class="regions">
          <h4>Changed Regions</h4>
          <ul>
            ${result.changedRegions
				.map(
					(region, i) => `
              <li>Region ${i + 1}: (${region.x1},${region.y1}) to (${region.x2},${region.y2})</li>
            `,
				)
				.join('')}
          </ul>
        </div>
      `
				: ''
		}
    </div>
  `,
		)
		.join('')}
</body>
</html>`;

	await fs.writeFile(outputPath, html);
}

/**
 * Accept current snapshots as baselines
 * @returns {Promise<number>} - Number of accepted snapshots
 */
async function acceptSnapshots() {
	const dasiteDir = path.join(__dirname, 'dasite');

	try {
		await fs.mkdir(dasiteDir, { recursive: true });
	} catch (err) {
		console.error('Error creating dasite directory:', err.message);
		return 0;
	}

	// List all URL directories
	const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
	const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

	let accepted = 0;

	for (const dir of directories) {
		const urlDir = path.join(dasiteDir, dir);

		try {
			// Check if current.png exists in this directory
			const currentPath = path.join(urlDir, 'current.png');
			const baselinePath = path.join(urlDir, 'baseline.png');

			try {
				await fs.access(currentPath);
				// Copy current to baseline
				await fs.copyFile(currentPath, baselinePath);
				accepted++;
			} catch (err) {
				// current.png doesn't exist in this directory, skip
				continue;
			}
		} catch (err) {
			console.error(`Error processing directory ${dir}:`, err.message);
		}
	}

	console.log(`Snapshots accepted as baselines: ${accepted}`);
	return accepted;
}

/**
 * Legacy comparison function for backward compatibility
 * @param {string} outputDir - Directory containing screenshots
 * @param {Object} options - Comparison options
 * @returns {Promise<Object>} - Comparison results
 */
async function compareLegacyScreenshots(outputDir, options = {}) {
	const { threshold = 0, alpha = 0.5, highlightColor = '#FF0000', pixelThreshold = 0 } = options;

	const files = await fs.readdir(outputDir);
	const currentScreenshots = files.filter(
		(file) =>
			file.endsWith('.png') && !file.startsWith('original_') && !file.includes('.diff.'),
	);

	if (currentScreenshots.length === 0) {
		return {
			pairs: [],
			message: 'No screenshots found to compare',
		};
	}

	const previousScreenshots = files
		.filter((file) => file.startsWith('original_') && file.endsWith('.png'))
		.map((file) => file.replace('original_', ''));

	// If no baseline screenshots exist, create them automatically
	if (previousScreenshots.length === 0) {
		console.log('No baseline screenshots found. Creating baselines...');

		for (const screenshot of currentScreenshots) {
			const sourcePath = path.join(outputDir, screenshot);
			const targetPath = path.join(outputDir, `original_${screenshot}`);
			await fs.copyFile(sourcePath, targetPath);
		}

		return {
			pairs: [],
			message: 'Baseline screenshots created. Run again to compare with current screenshots.',
			baselinesCreated: true,
		};
	}

	// Find matching screenshots
	const toCompare = currentScreenshots.filter((img) => previousScreenshots.includes(img));

	if (toCompare.length === 0) {
		return {
			pairs: [],
			message: 'No matching screenshots found to compare',
		};
	}

	// Perform comparisons
	const pairs = [];

	for (const img of toCompare) {
		const img1 = await fs.readFile(path.join(outputDir, `original_${img}`));
		const img2 = await fs.readFile(path.join(outputDir, img));
		const diffPath = path.join(outputDir, img.replace('.png', '.diff.png'));

		// Use ResembleJS correctly
		const comparison = await new Promise((resolve) => {
			resemble(img1)
				.compareTo(img2)
				.ignoreAntialiasing()
				.scaleToSameSize()
				.outputSettings({
					errorColor: {
						red: parseInt(highlightColor.substring(1, 3), 16),
						green: parseInt(highlightColor.substring(3, 5), 16),
						blue: parseInt(highlightColor.substring(5, 7), 16),
					},
					errorType: 'movement',
					transparency: alpha,
					largeImageThreshold: 1200,
				})
				.onComplete((data) => {
					resolve(data);
				});
		});

		// Save diff image - fixed to handle buffer correctly
		await fs.writeFile(
			diffPath,
			comparison.getBuffer ? comparison.getBuffer() : Buffer.from([]),
		);

		// Extract regions with changes
		const changedRegions = [];
		if (comparison.rawMisMatchPercentage > 0) {
			changedRegions.push({
				x1: 0,
				y1: 0,
				x2: comparison.dimensionDifference?.width || 0,
				y2: comparison.dimensionDifference?.height || 0,
				pixels: Math.floor(
					(comparison.rawMisMatchPercentage *
						(comparison.dimensionDifference?.width || 0) *
						(comparison.dimensionDifference?.height || 0)) /
						100,
				),
			});
		}

		pairs.push({
			filename: img,
			original: `original_${img}`,
			current: img,
			diffPath,
			diffPercentage: comparison.rawMisMatchPercentage,
			changed: comparison.rawMisMatchPercentage > threshold,
			changedRegions,
			analysis: comparison,
		});
	}

	// Count the changed pairs
	const changedPairs = pairs.filter((pair) => pair.changed);
	let message = `Compared ${pairs.length} screenshots`;

	// Add information about changed screenshots
	if (changedPairs.length > 0) {
		message += `\nFound ${changedPairs.length} differences`;
	} else {
		message += '\nNo changes detected';
	}

	return { pairs, message, changedPairsCount: changedPairs.length };
}

/**
 * Main function to handle CLI commands
 */
async function main() {
	const args = process.argv.slice(2);
	const shouldCrawl = args.includes('--crawl') || args.includes('-c');
	const shouldAccept = args.includes('--accept');
	const shouldCompare = args.includes('--compare');

	if (shouldAccept) {
		await acceptSnapshots();
		return;
	}

	if (shouldCompare) {
		console.log('Comparing screenshots...');
		const results = await compareScreenshots();
		console.log(results.message);

		// If baselines were just created, exit successfully
		if (results.baselinesCreated) {
			return;
		}

		const changedPairs = results.pairs.filter((pair) => pair.changed);
		if (changedPairs.length > 0) {
			console.log('Screenshots compared:', results.pairs.length);
			console.log('Changed screenshots:', changedPairs.length);

			// This format is required by the test
			console.log(`Found ${changedPairs.length} differences`);

			// Exit with error code after printing the message
			process.exit(1);
		}
		return;
	}

	if (args[0] && !args[0].startsWith('--')) {
		const url = args[0];
		if (shouldCrawl) {
			console.log(`Starting site crawl from ${url}...`);
			await crawlSite(url);
		} else {
			// Single page screenshot
			const browser = await chromium.launch();
			const page = await browser.newPage();

			try {
				await page.goto(url, { waitUntil: 'networkidle' });
				await takeScreenshot(page, url);
			} finally {
				await browser.close();
			}
		}
	}
}

main().catch((error) => {
	console.error('Error:', error.message);
	process.exit(1);
});
