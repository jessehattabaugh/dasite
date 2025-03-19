import fs from 'fs/promises';
import path from 'path';

/**
 * Generate an index HTML file that links to individual reports
 * @param {string} reportsDir - Directory containing the reports
 * @param {string} indexPath - Path to save the index HTML
 * @param {string[]} pageNames - List of page names with reports
 * @returns {Promise<string>} Path to the index file
 */
export async function generateIndexReport(reportsDir, indexPath, pageNames) {
	const reportLinks = await Promise.all(
		pageNames.map(async (pageName) => {
			const pageReportDir = path.join(reportsDir, pageName.replace('.png', ''));
			const pageReportPath = path.join(pageReportDir, 'report.html');

			// Check if report exists
			const exists = await fs
				.access(pageReportPath)
				.then(() => true)
				.catch(() => false);
			if (!exists) return '';

			const relativePath = path.relative(path.dirname(indexPath), pageReportPath);
			return `<li><a href="${relativePath}">${pageName}</a></li>`;
		}),
	);

	const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Comparison Reports</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 {
      color: #2c3e50;
    }
    ul {
      padding-left: 20px;
    }
    li {
      margin-bottom: 10px;
    }
    a {
      color: #3498db;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <h1>Visual Comparison Reports</h1>
  <p>Generated on: ${new Date().toLocaleString()}</p>

  <h2>Pages</h2>
  <ul>
    ${reportLinks.filter(Boolean).join('\n    ')}
  </ul>
</body>
</html>`;

	await fs.writeFile(indexPath, html);
	return indexPath;
}
