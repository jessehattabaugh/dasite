import fs from 'fs/promises';
import path from 'path';
import playwright from 'playwright';

/**
 * @typedef {Object} ExportOptions
 * @property {string} reportPath - Path to the HTML report to export
 * @property {string} format - Format to export to (pdf, json, markdown)
 * @property {string} outputPath - Path to save the exported file
 */

/**
 * Export a report to the specified format
 * @param {ExportOptions} options - Export options
 * @returns {Promise<string>} Path to the exported file
 */
export async function exportReport({ reportPath, format, outputPath }) {
	switch (format.toLowerCase()) {
		case 'pdf':
			return exportToPDF(reportPath, outputPath);
		case 'json':
		case 'json5':
			return exportToJSON(reportPath, outputPath);
		case 'md':
		case 'markdown':
			return exportToMarkdown(reportPath, outputPath);
		default:
			throw new Error(`Unsupported export format: ${format}`);
	}
}

/**
 * Export an HTML report to PDF using Playwright
 * @param {string} reportPath - Path to the HTML report
 * @param {string} outputPath - Output path for the PDF file
 * @returns {Promise<string>} Path to the exported PDF
 */
async function exportToPDF(reportPath, outputPath) {
	const browser = await playwright.chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	// Convert file path to URL
	const fileUrl = `file://${path.resolve(reportPath)}`;
	await page.goto(fileUrl);

	// Ensure styles/scripts are loaded
	await page.waitForLoadState('networkidle');

	// Export to PDF
	await page.pdf({ path: outputPath, format: 'A4' });

	await browser.close();
	return outputPath;
}

/**
 * Export an HTML report to JSON format
 * @param {string} reportPath - Path to the HTML report
 * @param {string} outputPath - Path to save the JSON file
 * @returns {Promise<string>} Path to the exported JSON
 */
async function exportToJSON(reportPath, outputPath) {
	// Read source HTML for parsing
	const html = await fs.readFile(reportPath, 'utf8');

	// Extract information from the HTML report
	const baselineMatch = html.match(
		/baseline-image" alt="Baseline screenshot" src="(data:image\/[^;]+;base64,[^"]+)"/,
	);
	const currentMatch = html.match(
		/current-image" alt="Current screenshot" src="(data:image\/[^;]+;base64,[^"]+)"/,
	);
	const diffMatch = html.match(
		/diff-image" alt="Diff image" src="(data:image\/[^;]+;base64,[^"]+)"/,
	);
	const titleMatch = html.match(/<title>(.*?)<\/title>/);
	const dateMatch = html.match(/Generated on: (.*?)</);

	const jsonData = {
		title: titleMatch ? titleMatch[1] : 'Visual Comparison Report',
		generatedAt: dateMatch ? dateMatch[1] : new Date().toISOString(),
		baseline: {
			dataUrl: baselineMatch ? baselineMatch[1].substring(0, 100) + '...' : null,
			fullDataUrl: baselineMatch ? baselineMatch[1] : null,
		},
		current: {
			dataUrl: currentMatch ? currentMatch[1].substring(0, 100) + '...' : null,
			fullDataUrl: currentMatch ? currentMatch[1] : null,
		},
		differences: {
			dataUrl: diffMatch ? diffMatch[1].substring(0, 100) + '...' : null,
			fullDataUrl: diffMatch ? diffMatch[1] : null,
		},
		reportUrl: path.resolve(reportPath),
	};

	await fs.writeFile(outputPath, JSON.stringify(jsonData, null, 2));
	return outputPath;
}

/**
 * Export an HTML report to Markdown format
 * @param {string} reportPath - Path to the HTML report
 * @param {string} outputPath - Path to save the Markdown file
 * @returns {Promise<string>} Path to the exported Markdown
 */
async function exportToMarkdown(reportPath, outputPath) {
	// Read source HTML for parsing
	const html = await fs.readFile(reportPath, 'utf8');

	// Extract info from the HTML
	const titleMatch = html.match(/<h1>(.*?)<\/h1>/);
	const title = titleMatch ? titleMatch[1] : 'Visual Comparison Report';
	const dateMatch = html.match(/Generated on: (.*?)</);
	const date = dateMatch ? dateMatch[1] : new Date().toLocaleString();

	// Base path for report to calculate relative image paths
	const reportDir = path.dirname(reportPath);

	// Generate Markdown content
	const markdown = `# ${title}

Generated on: ${date}

## Comparison Summary

This report compares baseline and current screenshots to identify visual changes.

## Images

### Baseline
![Baseline Screenshot](./baseline.png)

### Current
![Current Screenshot](./current.png)

### Differences
![Visual Differences](./diff.png)

## How to View

For interactive comparison, please open the HTML report:
\`\`\`
${path.relative(path.dirname(outputPath), reportPath)}
\`\`\`

## Export Information

- PDF Export: Generate a static PDF of this report
- JSON Export: Get structured data about the comparison
- Markdown Export: This file format
`;

	await fs.writeFile(outputPath, markdown);
	return outputPath;
}
