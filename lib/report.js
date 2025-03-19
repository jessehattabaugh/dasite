import fs from 'fs/promises';
import path from 'path';

/**
 * @typedef {Object} ReportOptions
 * @property {string} baseline - Path to baseline image
 * @property {string} current - Path to current image
 * @property {string} [diff] - Path to diff image
 * @property {string} output - Output directory for the report
 * @property {string} [title] - Title for the report
 */

/**
 * Generates an HTML report comparing before and after screenshots
 * @param {ReportOptions} options - Report generation options
 * @returns {Promise<string>} Path to the generated HTML report
 */
export async function generateReport({
	baseline,
	current,
	diff,
	output,
	title = 'Visual Comparison Report',
}) {
	// Ensure output directory exists
	await fs.mkdir(output, { recursive: true });

	// Check if diff exists; if not, we'll display a message instead
	let diffExists = false;
	try {
		await fs.access(diff);
		diffExists = true;
	} catch {
		// Diff file doesn't exist, but we'll continue without it
	}

	// Read image files as base64 for embedding
	const [baselineImg, currentImg, diffImg] = await Promise.all([
		encodeImage(baseline),
		encodeImage(current),
		diffExists ? encodeImage(diff) : null,
	]);

	// Get just the filenames for better display in the report
	const baselineName = path.basename(baseline);
	const currentName = path.basename(current);
	const diffName = diffExists ? path.basename(diff) : 'No diff available';

	// Generate HTML content with interactive viewer
	const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2 {
      color: #2c3e50;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .report-meta {
      color: #7f8c8d;
      font-size: 0.9em;
    }
    .comparison-container {
      margin: 40px 0;
    }
    .image-comparison {
      position: relative;
      max-width: 100%;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .comparison-slider {
      position: absolute;
      top: 0;
      left: 0;
      width: 2px;
      height: 100%;
      background: rgba(255, 0, 0, 0.7);
      cursor: col-resize;
      z-index: 50;
    }
    .image-wrapper {
      position: relative;
      overflow: hidden;
      max-width: 100%;
    }
    .baseline-image, .current-image, .diff-image {
      max-width: 100%;
      display: block;
    }
    .baseline-overlay {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      overflow: hidden;
      border-right: 2px solid rgba(255, 0, 0, 0.7);
    }
    .diff-view {
      margin-top: 30px;
    }
    .image-selector {
      margin-bottom: 20px;
    }
    .btn {
      background: #3498db;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 10px;
    }
    .btn:hover {
      background: #2980b9;
    }
    .side-by-side {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
    }
    .side-by-side > div {
      flex: 1;
      min-width: 300px;
    }
    .export-options {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }
    .caption {
      font-size: 0.9em;
      color: #7f8c8d;
      text-align: center;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${title}</h1>
    <div class="report-meta">
      Generated on: ${new Date().toLocaleString()}
    </div>
  </div>

  <div class="comparison-container">
    <h2>Interactive Comparison</h2>
    <p>Drag the slider to compare baseline and current images</p>

    <div class="image-comparison" id="comparison">
      <div class="image-wrapper">
        <img src="${currentImg}" class="current-image" alt="Current screenshot">
        <div class="baseline-overlay" id="overlay">
          <img src="${baselineImg}" class="baseline-image" alt="Baseline screenshot">
        </div>
        <div class="comparison-slider" id="slider"></div>
      </div>
      <div class="caption">
        Baseline: ${baselineName} | Current: ${currentName}
      </div>
    </div>

    <div class="image-selector">
      <button class="btn" id="showBaseline">Baseline</button>
      <button class="btn" id="showCurrent">Current</button>
      <button class="btn" id="showDiff">Differences</button>
      <button class="btn" id="showSideBySide">Side by Side</button>
    </div>

    <div id="side-by-side" class="side-by-side" style="display: none;">
      <div>
        <h3>Baseline</h3>
        <img src="${baselineImg}" alt="Baseline screenshot" class="baseline-image">
        <div class="caption">${baselineName}</div>
      </div>
      <div>
        <h3>Current</h3>
        <img src="${currentImg}" alt="Current screenshot" class="current-image">
        <div class="caption">${currentName}</div>
      </div>
    </div>

    <div id="diff-view" class="diff-view" style="display: none;">
      <h3>Visual Differences</h3>
      ${
			diffImg
				? `
        <img src="${diffImg}" alt="Diff image" class="diff-image">
        <div class="caption">${diffName}</div>
      `
				: '<p>No difference image available</p>'
		}
    </div>
  </div>

  <div class="export-options">
    <h2>Export Options</h2>
    <button class="btn" id="exportPDF">Export as PDF</button>
    <button class="btn" id="exportJSON">Export as JSON</button>
    <button class="btn" id="exportMD">Export as Markdown</button>
  </div>

  <script>
    // Interactive comparison slider
    document.addEventListener('DOMContentLoaded', function() {
      const slider = document.getElementById('slider');
      const overlay = document.getElementById('overlay');
      const comparison = document.getElementById('comparison');
      const showBaseline = document.getElementById('showBaseline');
      const showCurrent = document.getElementById('showCurrent');
      const showDiff = document.getElementById('showDiff');
      const showSideBySide = document.getElementById('showSideBySide');
      const diffView = document.getElementById('diff-view');
      const sideBySideView = document.getElementById('side-by-side');

      // Initialize the slider position
      slider.style.left = '50%';
      overlay.style.width = '50%';

      // Handle slider dragging
      let isDragging = false;

      slider.addEventListener('mousedown', function(e) {
        isDragging = true;
        e.preventDefault();
      });

      document.addEventListener('mouseup', function() {
        isDragging = false;
      });

      comparison.addEventListener('mousemove', function(e) {
        if (!isDragging) return;

        const rect = comparison.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = (x / rect.width) * 100;

        if (percent >= 0 && percent <= 100) {
          slider.style.left = \`\${percent}%\`;
          overlay.style.width = \`\${percent}%\`;
        }
      });

      // View toggles
      showBaseline.addEventListener('click', function() {
        overlay.style.width = '100%';
        slider.style.left = '100%';
        diffView.style.display = 'none';
        sideBySideView.style.display = 'none';
        comparison.style.display = 'block';
      });

      showCurrent.addEventListener('click', function() {
        overlay.style.width = '0%';
        slider.style.left = '0%';
        diffView.style.display = 'none';
        sideBySideView.style.display = 'none';
        comparison.style.display = 'block';
      });

      showDiff.addEventListener('click', function() {
        diffView.style.display = 'block';
        sideBySideView.style.display = 'none';
        comparison.style.display = 'none';
      });

      showSideBySide.addEventListener('click', function() {
        sideBySideView.style.display = 'flex';
        diffView.style.display = 'none';
        comparison.style.display = 'none';
      });

      // Export functionality (frontend placeholders that connect to backend)
      document.getElementById('exportPDF').addEventListener('click', function() {
        window.location.href = './export?format=pdf';
      });

      document.getElementById('exportJSON').addEventListener('click', function() {
        window.location.href = './export?format=json';
      });

      document.getElementById('exportMD').addEventListener('click', function() {
        window.location.href = './export?format=markdown';
      });
    });
  </script>
</body>
</html>`;

	// Write the HTML report to file
	const reportPath = path.join(output, 'report.html');
	await fs.writeFile(reportPath, html);
	return reportPath;
}

/**
 * Encodes an image file as a data URI
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} Data URI string representation of the image
 */
async function encodeImage(imagePath) {
	try {
		const imageData = await fs.readFile(imagePath);
		const extension = path.extname(imagePath).toLowerCase().substring(1);
		const mimeType =
			extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
		return `data:${mimeType};base64,${imageData.toString('base64')}`;
	} catch (err) {
		console.error(`Error encoding image ${imagePath}: ${err.message}`);
		return '';
	}
}
