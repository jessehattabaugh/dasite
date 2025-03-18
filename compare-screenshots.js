import { createCanvas, loadImage } from 'canvas';

// Compare screenshots between current and original versions
import fs from 'fs/promises';
import path from 'path';

/**
 * @typedef {Object} ComparisonResult
 * @property {string} filename - Filename of the screenshot
 * @property {boolean} changed - Whether the screenshot has changed
 * @property {number} diffPercentage - Percentage of pixels that have changed
 * @property {string} diffPath - Path to the diff image if one was created
 * @property {Array<Object>} changedRegions - Regions with significant changes
 */

/**
 * Compare two images pixel by pixel and generate a diff image
 * @param {string} originalPath - Path to the original screenshot
 * @param {string} currentPath - Path to the current screenshot
 * @param {string} diffPath - Path to save the diff image
 * @param {Object} options - Comparison options
 * @param {string} [options.highlightColor='#FF0000'] - Color to highlight differences
 * @param {number} [options.threshold=0] - Threshold for pixel difference (0-255)
 * @param {number} [options.alpha=0.5] - Alpha transparency for highlighting
 * @returns {Object} Comparison result with difference metrics
 */
async function compareImages(originalPath, currentPath, diffPath, options = {}) {
	// Default options
	const { highlightColor = '#FF0000', threshold = 0, alpha = 0.5 } = options;

	// Load both images
	const originalImage = await loadImage(originalPath);
	const currentImage = await loadImage(currentPath);

	// Create canvas for the diff image
	const width = Math.max(originalImage.width, currentImage.width);
	const height = Math.max(originalImage.height, currentImage.height);
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');

	// Draw the current image as the base
	ctx.drawImage(currentImage, 0, 0);

	// Get image data to compare pixel by pixel
	const originalCanvas = createCanvas(originalImage.width, originalImage.height);
	const originalCtx = originalCanvas.getContext('2d');
	originalCtx.drawImage(originalImage, 0, 0);

	const originalData = originalCtx.getImageData(0, 0, originalImage.width, originalImage.height);
	const currentData = ctx.getImageData(0, 0, width, height);

	const diffData = ctx.createImageData(width, height);

	// Compare pixels and highlight differences
	let diffPixels = 0;
	let totalPixels =
		Math.min(originalImage.width, currentImage.width) *
		Math.min(originalImage.height, currentImage.height);

	// Parse highlight color
	const r = parseInt(highlightColor.slice(1, 3), 16);
	const g = parseInt(highlightColor.slice(3, 5), 16);
	const b = parseInt(highlightColor.slice(5, 7), 16);

	// Track regions with changes for heatmap generation
	const changedRegions = [];
	let currentRegion = null;

	for (let y = 0; y < Math.min(originalImage.height, currentImage.height); y++) {
		for (let x = 0; x < Math.min(originalImage.width, currentImage.width); x++) {
			const i = (y * width + x) * 4;
			const j = (y * originalImage.width + x) * 4;

			// Get pixel values
			const r1 = originalData.data[j];
			const g1 = originalData.data[j + 1];
			const b1 = originalData.data[j + 2];

			const r2 = currentData.data[i];
			const g2 = currentData.data[i + 1];
			const b2 = currentData.data[i + 2];

			// Calculate difference
			const diff = Math.sqrt(
				Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2),
			);

			// If difference exceeds threshold, highlight it
			if (diff > threshold) {
				diffPixels++;

				// Create a highlighted pixel in the diff image
				diffData.data[i] = r;
				diffData.data[i + 1] = g;
				diffData.data[i + 2] = b;
				diffData.data[i + 3] = Math.round(255 * alpha);

				// Track regions with changes
				if (!currentRegion) {
					currentRegion = {
						x1: x,
						y1: y,
						x2: x,
						y2: y,
						pixels: 1,
					};
				} else {
					// If nearby, expand current region
					const inRange =
						Math.abs(x - currentRegion.x2) < 20 && Math.abs(y - currentRegion.y2) < 20;

					if (inRange) {
						currentRegion.x2 = Math.max(currentRegion.x2, x);
						currentRegion.y2 = Math.max(currentRegion.y2, y);
						currentRegion.pixels++;
					} else {
						// Start a new region if too far from current one
						if (currentRegion.pixels > 10) {
							changedRegions.push(currentRegion);
						}
						currentRegion = {
							x1: x,
							y1: y,
							x2: x,
							y2: y,
							pixels: 1,
						};
					}
				}
			} else {
				// Copy the current image pixel
				diffData.data[i] = currentData.data[i];
				diffData.data[i + 1] = currentData.data[i + 1];
				diffData.data[i + 2] = currentData.data[i + 2];
				diffData.data[i + 3] = currentData.data[i + 3];
			}
		}
	}

	// Add the final region if it exists
	if (currentRegion && currentRegion.pixels > 10) {
		changedRegions.push(currentRegion);
	}

	// Put the diff data on the canvas
	ctx.putImageData(diffData, 0, 0);

	// Calculate difference percentage
	const diffPercentage = (diffPixels / totalPixels) * 100;

	// Save the diff image
	const buffer = canvas.toBuffer('image/png');
	await fs.writeFile(diffPath, buffer);

	return {
		diffPixels,
		totalPixels,
		diffPercentage,
		changedRegions,
		width,
		height,
	};
}

/**
 * Find all original screenshots with matching current screenshots
 * @param {string} screenshotsDir - Directory containing screenshots
 * @returns {Array<Object>} Array of screenshot pairs
 */
async function findScreenshotPairs(screenshotsDir) {
	const files = await fs.readdir(screenshotsDir);

	const originalFiles = files.filter(
		(file) => file.startsWith('original_') && file.endsWith('.png'),
	);

	const pairs = [];

	for (const originalFile of originalFiles) {
		// Extract the non-original filename
		const currentFile = originalFile.replace('original_', '');

		// Check if the current file exists
		if (files.includes(currentFile)) {
			pairs.push({
				original: path.join(screenshotsDir, originalFile),
				current: path.join(screenshotsDir, currentFile),
				filename: currentFile,
			});
		}
	}

	return pairs;
}

/**
 * Compare all screenshots in the specified directory
 * @param {string} screenshotsDir - Directory containing screenshots
 * @param {Object} options - Comparison options
 * @returns {Object} Comparison results
 */
async function compareScreenshots(screenshotsDir, options = {}) {
	const pairs = await findScreenshotPairs(screenshotsDir);

	if (pairs.length === 0) {
		return {
			success: true,
			message: 'No previous screenshots found for comparison',
			pairs: [],
			changedCount: 0,
			unchangedCount: 0,
		};
	}

	const results = [];
	let changedCount = 0;

	for (const pair of pairs) {
		const diffFilename = pair.filename.replace('.png', '.diff.png');
		const diffPath = path.join(screenshotsDir, diffFilename);

		try {
			const comparison = await compareImages(pair.original, pair.current, diffPath, options);

			const result = {
				filename: pair.filename,
				original: pair.original,
				current: pair.current,
				diffPath,
				changed: comparison.diffPercentage > 0,
				diffPercentage: comparison.diffPercentage,
				diffPixels: comparison.diffPixels,
				totalPixels: comparison.totalPixels,
				changedRegions: comparison.changedRegions,
				dimensions: {
					width: comparison.width,
					height: comparison.height,
				},
			};

			results.push(result);

			if (result.changed) {
				changedCount++;
			}
		} catch (error) {
			console.error(`Error comparing ${pair.filename}:`, error);
			results.push({
				filename: pair.filename,
				error: error.message,
				changed: false,
			});
		}
	}

	return {
		success: true,
		message: 'Screenshots compared successfully',
		pairs: results,
		changedCount,
		unchangedCount: pairs.length - changedCount,
	};
}

export { compareScreenshots, findScreenshotPairs, compareImages };
