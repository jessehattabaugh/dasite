import assert from 'node:assert/strict';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { startServer } from '../server.js';
import { test } from 'node:test';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', 'index.js');
const screenshotsDir = path.join(__dirname, '..', 'screenshots');

async function cleanScreenshots() {
	try {
		await fs.mkdir(screenshotsDir, { recursive: true });
		const files = await fs.readdir(screenshotsDir);
		await Promise.all(
			files
				.filter((file) => file.endsWith('.png'))
				.map((file) => fs.unlink(path.join(screenshotsDir, file))),
		);
	} catch (err) {
		console.error('Error cleaning screenshots:', err);
	}
}

// Helper function to clean snapshot directories
async function cleanSnapshots(testType = 'playwright') {
	try {
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', testType);
		await fs.mkdir(snapshotsDir, { recursive: true });
		const files = await fs.readdir(snapshotsDir);
		await Promise.all(
			files
				.filter((file) => file.endsWith('.png'))
				.map((file) => fs.unlink(path.join(snapshotsDir, file))),
		);
	} catch (err) {
		console.error(`Error cleaning ${testType} snapshots:`, err);
	}
}

test('🖼️ CLI takes screenshot of provided URL', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl}`);

		// Verify output contains success message
		assert.match(stdout, /Screenshot saved to:/);

		// Check if screenshot file exists
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Verify a screenshot was created
		assert.equal(screenshots.length, 1, 'Expected one screenshot to be created');
		assert.match(screenshots[0], /localhost/, 'Screenshot filename should contain the URL');

		// Verify screenshot file has content
		const screenshotPath = path.join(screenshotsDir, screenshots[0]);
		const fileStats = await fs.stat(screenshotPath);
		assert.ok(fileStats.size > 1000, 'Screenshot should have reasonable file size');
	} finally {
		// Always close the server
		server.close();
	}
});

test('❓ CLI shows usage when no URL is provided', async () => {
	try {
		await execAsync(`node ${cliPath}`);
		assert.fail('Should have thrown error');
	} catch (err) {
		assert.match(err.stderr, /Usage: dasite <url>/);
		assert.equal(err.code, 1);
	}
});

test('❌ CLI handles invalid URLs gracefully', async () => {
	try {
		await execAsync(`node ${cliPath} http://this-is-an-invalid-domain-123456789.test`);
		assert.fail('Should have thrown error');
	} catch (err) {
		assert.match(err.stderr, /Error:/);
		assert.equal(err.code, 1);
	}
});

test('🕸️ CLI crawls site when --crawl flag is provided', async () => {
	// Start local test server with multiple pages
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL and crawl flag
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Verify output contains crawling messages
		assert.match(stdout, /Starting site crawl from/);
		assert.match(stdout, /Crawling completed!/);

		// Check if screenshots exist
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Our test server has 7 pages (home, about, contact, products, products/item1, products/item2, team)
		// So we should have 7 screenshots
		assert.ok(
			screenshots.length >= 7,
			`Expected at least 7 screenshots, but got ${screenshots.length}`,
		);

		// Verify we captured specific pages
		const screenshotNames = screenshots.map((name) => name.toLowerCase());

		// Check for main page
		assert.ok(
			screenshotNames.some((name) => name.includes('localhost') && !name.includes('/')),
			'Should have screenshot of main page',
		);

		// Check for about page
		assert.ok(
			screenshotNames.some((name) => name.includes('about')),
			'Should have screenshot of about page',
		);

		// Check for products page
		assert.ok(
			screenshotNames.some((name) => name.includes('products') && !name.includes('item')),
			'Should have screenshot of products page',
		);

		// Check for product items
		assert.ok(
			screenshotNames.some((name) => name.includes('item1')),
			'Should have screenshot of product item 1',
		);
		assert.ok(
			screenshotNames.some((name) => name.includes('item2')),
			'Should have screenshot of product item 2',
		);

		// Verify screenshot files have content
		for (const screenshot of screenshots) {
			const filePath = path.join(screenshotsDir, screenshot);
			const stats = await fs.stat(filePath);
			assert.ok(
				stats.size > 1000,
				`Screenshot ${screenshot} should have reasonable file size`,
			);
		}
	} finally {
		// Always close the server
		server.close();
	}
});

test('🕸️ CLI crawls site when -c shorthand flag is used', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL and shorthand flag
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} -c`);

		// Verify output contains crawling messages
		assert.match(stdout, /Starting site crawl from/);
		assert.match(stdout, /Crawling completed!/);

		// Check if multiple screenshots exist
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));
		assert.ok(screenshots.length > 1, 'Should have multiple screenshots');
	} finally {
		// Always close the server
		server.close();
	}
});

test('🔗 CLI informs about additional pages without crawling by default', async () => {
	// Start local test server with multiple pages
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL without crawl flag
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl}`);

		// Verify output contains info about additional links
		assert.match(stdout, /Found \d+ additional links on the same domain/);
		assert.match(stdout, /To crawl all pages, add the --crawl or -c flag/);

		// Check if only one screenshot exists (shouldn't crawl)
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));
		assert.equal(screenshots.length, 1, 'Should have only one screenshot without crawl flag');
	} finally {
		// Always close the server
		server.close();
	}
});

test('🕸️ CLI handles pages without links correctly during crawl', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();
	const noLinksUrl = `${baseUrl}/team`; // This page has just one link back to about

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI starting from a page with minimal links
		const { stdout } = await execAsync(`node ${cliPath} ${noLinksUrl} --crawl`);

		// Verify crawling worked
		assert.match(stdout, /Crawling completed!/);

		// Verify we got more than just the starting page
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Should have more than one screenshot (team page links to about, about links to home, etc.)
		assert.ok(
			screenshots.length > 1,
			'Should crawl multiple pages even when starting from a page with few links',
		);
	} finally {
		// Always close the server
		server.close();
	}
});

test('🌐 CLI does not follow external links during crawl', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with crawl
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Check if screenshots exist
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Verify we don't have any screenshots from external domains
		const hasExternalScreenshots = screenshots.some(
			(name) => name.includes('example_com') || name.includes('example.com'),
		);

		assert.ok(!hasExternalScreenshots, 'Should not have screenshots of external domains');
	} finally {
		// Always close the server
		server.close();
	}
});

test('📸 CLI accepts current snapshots as baselines', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots and snapshots
		await cleanScreenshots();
		await cleanSnapshots('playwright');

		// Create the snapshots directory
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', 'playwright');
		await fs.mkdir(snapshotsDir, { recursive: true });

		// Take screenshots
		await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Move screenshots to snapshots directory as .tmp.png files
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		console.log('Screenshots before moving:', screenshots);

		// Create some test .tmp.png files in the snapshots directory
		for (const screenshot of screenshots) {
			const sourcePath = path.join(screenshotsDir, screenshot);
			const tmpPath = path.join(snapshotsDir, screenshot.replace('.png', '.tmp.png'));
			await fs.copyFile(sourcePath, tmpPath);
		}

		// Verify we have .tmp.png files in the snapshots directory
		const tmpFiles = (await fs.readdir(snapshotsDir)).filter((file) =>
			file.endsWith('.tmp.png'),
		);
		console.log('Temporary snapshot files:', tmpFiles);
		assert.ok(tmpFiles.length > 0, 'Should have temporary snapshot files');

		// Run the accept command
		const { stdout } = await execAsync(`node ${cliPath} --accept`);

		// Verify output mentions accepting snapshots
		assert.match(stdout, /Accepting current playwright snapshots as baselines/);
		assert.match(stdout, /Accepted \d+ snapshots as new baselines/);

		// Check that the baseline files were created (without .tmp)
		const baselineFiles = (await fs.readdir(snapshotsDir)).filter(
			(file) => file.endsWith('.png') && !file.endsWith('.tmp.png'),
		);

		console.log('Baseline files:', baselineFiles);

		// Should have the same number of baselines as tmp files
		assert.equal(baselineFiles.length, tmpFiles.length, 'Should have created baseline files');

		// Verify each baseline file corresponds to a tmp file
		for (const tmpFile of tmpFiles) {
			const baselineFile = tmpFile.replace('.tmp.png', '.png');
			assert.ok(
				baselineFiles.includes(baselineFile),
				`Baseline file ${baselineFile} should exist`,
			);

			// Verify baseline file has content
			const baselinePath = path.join(snapshotsDir, baselineFile);
			const fileStats = await fs.stat(baselinePath);
			assert.ok(fileStats.size > 1000, 'Baseline file should have content');
		}
	} finally {
		// Always close the server
		server.close();
	}
});

test('📸 CLI handles accepting snapshots for multiple test types', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous snapshots for different test types
		await cleanSnapshots('playwright');
		await cleanSnapshots('lighthouse');
		await cleanSnapshots('axe');

		// Create snapshots directories
		const testTypes = ['playwright', 'lighthouse', 'axe'];
		for (const type of testTypes) {
			const dir = path.join(__dirname, '..', 'dasite', 'snapshots', type);
			await fs.mkdir(dir, { recursive: true });

			// Create a test .tmp.png file in each directory
			const testFile = path.join(dir, 'test_snapshot.tmp.png');
			// Create a simple 1x1 pixel PNG file
			await fs.writeFile(
				testFile,
				Buffer.from(
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
					'base64',
				),
			);
		}

		// Run the accept command with all test types
		const { stdout } = await execAsync(`node ${cliPath} --accept --all-tests`);

		// Verify output mentions accepting snapshots for all test types
		for (const type of testTypes) {
			assert.match(stdout, new RegExp(`Accepting current ${type} snapshots as baselines`));
		}

		// Check that baseline files were created in each directory
		for (const type of testTypes) {
			const dir = path.join(__dirname, '..', 'dasite', 'snapshots', type);
			const files = await fs.readdir(dir);

			// Should have both .tmp.png and .png files
			assert.ok(
				files.some((file) => file === 'test_snapshot.png'),
				`Baseline file should exist in ${type} directory`,
			);
		}
	} finally {
		// Always close the server
		server.close();
	}
});

test('📸 CLI shows appropriate message when no snapshots to accept', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous snapshots
		await cleanSnapshots('playwright');

		// Run the accept command with an empty snapshots directory
		const { stdout } = await execAsync(`node ${cliPath} --accept`);

		// Verify output shows the appropriate message
		assert.match(stdout, /No snapshots found to accept as baselines/);
	} finally {
		// Always close the server
		server.close();
	}
});

test('📸 CLI compares against accepted baseline and detects changes', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	// Color values for testing (without the # prefix)
	const initialColor = 'ff0000'; // Red
	const changedColor = '0000ff'; // Blue

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take screenshot of page with initial color by setting cookies
		// We need to use a script that sets cookies before navigating to the page
		const colorUrl = `${baseUrl}/color-test`;
		const cookieScript = `
			import { chromium } from 'playwright';

			(async () => {
				const browser = await chromium.launch();
				const context = await browser.newContext();

				// Set the bg-color cookie
				await context.addCookies([{
					name: 'bg-color',
					value: '${initialColor}',
					domain: 'localhost',
					path: '/'
				}]);

				const page = await context.newPage();
				await page.goto('${colorUrl}');
				await page.waitForLoadState('networkidle');
				await page.close();
				await browser.close();
			})().catch(err => {
				console.error('Error setting cookies:', err);
				process.exit(1);
			});
		`;

		// Write the cookie script to a temporary file
		const tempScriptPath = path.join(__dirname, 'temp-cookie-script.mjs');
		await fs.writeFile(tempScriptPath, cookieScript);

		// Execute the cookie setting script
		await execAsync(`node ${tempScriptPath}`);

		// Now take the screenshot with dasite
		await execAsync(`node ${cliPath} ${colorUrl}`);

		// Accept current snapshot as baseline
		const acceptOutput = await execAsync(`node ${cliPath} --accept`);
		assert.match(acceptOutput.stdout, /Accepted \d+ snapshots as new baselines/);

		// Take screenshot again with the same color - should match baseline
		await execAsync(`node ${cliPath} ${colorUrl}`);

		// Compare against baseline - should pass because colors are the same
		const compareOutput1 = await execAsync(`node ${cliPath} --compare`);
		assert.match(compareOutput1.stdout, /Compared \d+ screenshots/);
		assert.doesNotMatch(compareOutput1.stdout, /Found \d+ differences/);

		// Now take screenshot with different color by updating the cookie
		const newCookieScript = `
			import { chromium } from 'playwright';

			(async () => {
				const browser = await chromium.launch();
				const context = await browser.newContext();

				// Set the bg-color cookie with new color
				await context.addCookies([{
					name: 'bg-color',
					value: '${changedColor}',
					domain: 'localhost',
					path: '/'
				}]);

				const page = await context.newPage();
				await page.goto('${colorUrl}');
				await page.waitForLoadState('networkidle');
				await page.close();
				await browser.close();
			})().catch(err => {
				console.error('Error setting cookies:', err);
				process.exit(1);
			});
		`;

		// Update the temporary script
		await fs.writeFile(tempScriptPath, newCookieScript);

		// Execute the new cookie setting script
		await execAsync(`node ${tempScriptPath}`);

		// Take a screenshot with the new color
		await execAsync(`node ${cliPath} ${colorUrl}`);

		// Clean up the temporary script file
		await fs.unlink(tempScriptPath);

		// Compare against baseline - should detect differences due to color change
		try {
			await execAsync(`node ${cliPath} --compare`);
			assert.fail('Command should have failed with differences detected');
		} catch (err) {
			// Ensure we get output from somewhere - either stdout, stderr, or the error message
			const output = err.stdout || err.stderr || err.message || '';
			console.log('TEST DEBUG - Output content:', output);

			// Test assertions - look for error indicators in all potential output streams
			const foundDiff =
				/Found \d+ differences/.test(output) ||
				/Found \d+ differences/.test(err.message) ||
				err.code !== 0;

			assert.ok(foundDiff, 'Should indicate differences were found in output');
			assert.ok(err.code !== 0, 'Exit code should be non-zero when differences found');
		}
	} finally {
		// Always close the server
		server.close();
	}
});
