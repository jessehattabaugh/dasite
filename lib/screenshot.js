import fs from 'fs/promises';
import path from 'path';

/**
 * Takes a screenshot of a webpage
 * @param {import('playwright').Page} page - The Playwright page
 * @param {string} url - The URL to screenshot
 * @param {Object} options - Screenshot options
 * @param {string} [options.outputDir] - Custom output directory
 * @param {boolean} [options.fullPage=true] - Whether to take a full page screenshot
 * @returns {Promise<string>} - The path to the saved screenshot
 */
export async function takeScreenshot(page, url, options = {}) {
	const { outputDir = path.resolve(process.cwd(), 'dasite'), fullPage = true } = options;

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

	// Create URL-specific directory inside the output directory
	const baseDir = path.resolve(outputDir);
	const urlDir = path.join(baseDir, dirName);

	await fs.mkdir(baseDir, { recursive: true });
	await fs.mkdir(urlDir, { recursive: true });

	// Use a consistent filename pattern within the URL directory
	const filePath = path.join(urlDir, 'current.png');

	// Take screenshot
	await page.screenshot({ path: filePath, fullPage });

	console.log(`Screenshot saved to: ${filePath}`);
	return filePath;
}

/**
 * Gets the directory path for a specific URL
 * @param {string} url - The URL to get directory for
 * @param {string} [baseDir] - Base directory (defaults to dasite in current working directory)
 * @returns {string} - The directory path
 */
export function getUrlDirectory(url, baseDir) {
	const parsedUrl = new URL(url);
	const urlForFilename = `${parsedUrl.hostname}${parsedUrl.pathname}`;

	const dirName = urlForFilename
		.replace(/^https?:\/\//, '')
		.replace(/[^\w\d]/g, '_')
		.replace(/_+/g, '_');

	const dasiteDir = baseDir || path.join(process.cwd(), 'dasite');
	return path.join(dasiteDir, dirName);
}
