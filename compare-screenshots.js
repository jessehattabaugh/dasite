import fs from 'fs/promises';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';

/**
 * Compare two images and generate diff with highlights
 */
async function compareImages(originalPath, currentPath, diffPath, options = {}) {
  const {
    highlightColor = '#FF0000',
    threshold = 0,
    pixelThreshold = 5,
    generateHeatmap = false,
    alpha = 0.5,
  } = options;

  const [originalImage, currentImage] = await Promise.all([
    loadImage(originalPath),
    loadImage(currentPath)
  ]);

  // Create canvas for diff image
  const width = Math.max(originalImage.width, currentImage.width);
  const height = Math.max(originalImage.height, currentImage.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw current image as base
  ctx.drawImage(currentImage, 0, 0);
  const baseImageData = ctx.getImageData(0, 0, width, height);

  // Draw original image on separate canvas for comparison
  const originalCanvas = createCanvas(width, height);
  const originalCtx = originalCanvas.getContext('2d');
  originalCtx.drawImage(originalImage, 0, 0);
  const originalImageData = originalCtx.getImageData(0, 0, width, height);

  // Track changes
  let diffPixels = 0;
  const changedRegions = [];
  let currentRegion = null;

  // Parse highlight color
  const r = parseInt(highlightColor.slice(1, 3), 16);
  const g = parseInt(highlightColor.slice(3, 5), 16);
  const b = parseInt(highlightColor.slice(5, 7), 16);

  // Compare each pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      const originalPixel = {
        r: originalImageData.data[i],
        g: originalImageData.data[i + 1],
        b: originalImageData.data[i + 2],
        a: originalImageData.data[i + 3]
      };

      const currentPixel = {
        r: baseImageData.data[i],
        g: baseImageData.data[i + 1],
        b: baseImageData.data[i + 2],
        a: baseImageData.data[i + 3]
      };

      // Calculate pixel difference
      const diff = Math.sqrt(
        Math.pow(originalPixel.r - currentPixel.r, 2) +
        Math.pow(originalPixel.g - currentPixel.g, 2) +
        Math.pow(originalPixel.b - currentPixel.b, 2)
      );

      if (diff > pixelThreshold) {
        diffPixels++;

        // Mark pixel as changed
        baseImageData.data[i] = r;
        baseImageData.data[i + 1] = g;
        baseImageData.data[i + 2] = b;
        baseImageData.data[i + 3] = Math.round(255 * alpha);

        // Track regions
        if (!currentRegion) {
          currentRegion = { x1: x, y1: y, x2: x, y2: y, pixels: 1 };
        } else {
          const inRange = Math.abs(x - currentRegion.x2) < 20 &&
                         Math.abs(y - currentRegion.y2) < 20;

          if (inRange) {
            currentRegion.x2 = Math.max(currentRegion.x2, x);
            currentRegion.y2 = Math.max(currentRegion.y2, y);
            currentRegion.pixels++;
          } else {
            if (currentRegion.pixels > 10) {
              changedRegions.push(currentRegion);
            }
            currentRegion = { x1: x, y1: y, x2: x, y2: y, pixels: 1 };
          }
        }
      }
    }
  }

  // Add final region if it exists
  if (currentRegion?.pixels > 10) {
    changedRegions.push(currentRegion);
  }

  // Put image data back
  ctx.putImageData(baseImageData, 0, 0);

  // Generate heatmap overlay if requested
  if (generateHeatmap && changedRegions.length > 0) {
    const heatmapPath = diffPath.replace('.diff.png', '.heatmap.png');
    const heatmapCanvas = createCanvas(width, height);
    const heatmapCtx = heatmapCanvas.getContext('2d');

    // Draw base image
    heatmapCtx.drawImage(currentImage, 0, 0);

    // Add heat overlay
    heatmapCtx.fillStyle = 'rgba(255,255,255,0.5)';
    heatmapCtx.fillRect(0, 0, width, height);

    changedRegions.forEach(region => {
      const intensity = Math.min(0.8, region.pixels / 1000);
      heatmapCtx.fillStyle = `rgba(255,0,0,${intensity})`;
      heatmapCtx.fillRect(
        region.x1,
        region.y1,
        region.x2 - region.x1,
        region.y2 - region.y1
      );
    });

    await fs.writeFile(heatmapPath, heatmapCanvas.toBuffer('image/png'));
  }

  // Save diff image
  await fs.writeFile(diffPath, canvas.toBuffer('image/png'));

  // Calculate diff percentage
  const totalPixels = width * height;
  const diffPercentage = (diffPixels / totalPixels) * 100;

  return {
    diffPixels,
    totalPixels,
    diffPercentage,
    changedRegions,
    width,
    height
  };
}

/**
 * Generate HTML comparison report
 */
async function generateReport(results, outputDir) {
  const reportPath = path.join(outputDir, 'comparison-report.html');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>DaSite Screenshot Comparison Report</title>
  <style>
 * @param {string} outputPath - Path to save report
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
          <h4>After</h4>
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
			result.changed && result.changedRegions.length > 0
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
 * Find matching screenshot pairs
 * @param {string} screenshotsDir - Directory containing screenshots
 */
async function findScreenshotPairs(screenshotsDir) {
	const files = await fs.readdir(screenshotsDir);
	const pairs = [];

	const originalFiles = files.filter(
		(file) => file.startsWith('original_') && file.endsWith('.png'),
	);

	for (const originalFile of originalFiles) {
		const currentFile = originalFile.replace('original_', '');
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
 * Compare screenshots in directory
 * @param {string} screenshotsDir - Directory containing screenshots
 * @param {Object} options - Comparison options
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
				changed: comparison.diffPercentage > (options.threshold || 0),
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

	// Generate report if requested
	if (options.generateReport) {
		const reportPath = path.join(screenshotsDir, 'comparison-report.html');
		await generateReport(results, reportPath);
	}

	const maxChange = Math.max(...results.filter((r) => r.changed).map((r) => r.diffPercentage));

	return {
		success: true,
		message:
			results.length > 0 ? 'Screenshots compared successfully' : 'No screenshots to compare',
		pairs: results,
		changedCount,
		unchangedCount: pairs.length - changedCount,
		exceedsThreshold: options.threshold !== undefined && maxChange > options.threshold,
	};
}

export { compareScreenshots, findScreenshotPairs, compareImages };
