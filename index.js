#!/usr/bin/env node

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error('Usage: dasite <url>');
		process.exit(1);
	}

	const url = args[0];
	const outputDir = path.join(__dirname, 'screenshots');

	console.log(`Taking screenshot of ${url}...`);

	try {
		// Launch browser
		const browser = await chromium.launch();
		const page = await browser.newPage();

		try {
			// Navigate to URL
			await page.goto(url, { waitUntil: 'networkidle' });

			// Create screenshots directory if it doesn't exist
			await fs.mkdir(outputDir, { recursive: true });

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
		} finally {
			await browser.close();
		}
	} catch (error) {
		console.error('Error:', error.message);
		process.exit(1);
	}
}

main();
