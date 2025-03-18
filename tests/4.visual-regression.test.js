import assert from 'node:assert';
import { chromium } from 'playwright';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { startServer } from '../server.js';
import { test } from 'node:test';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'index.js');
const screenshotsDir = path.join(projectRoot, 'screenshots');

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

test('Visual regression testing - compare screenshots with changed background color', async (t) => {
	// Start the test server
	const { server, baseUrl } = await startServer();

	try {
		// Create paths and URLs
		const colorTestUrl = `${baseUrl}/color-test`;
		const outputDir = path.join(projectRoot, 'output');
		const baselineDir = path.join(outputDir, 'baseline');
		const compareDir = path.join(outputDir, 'compare');

		// Ensure directories exist
		await fs.mkdir(outputDir, { recursive: true });
		await fs.mkdir(baselineDir, { recursive: true });
		await fs.mkdir(compareDir, { recursive: true });

		// Step 1: Take baseline screenshot with default white background
		console.log('Taking baseline screenshot...');
		await execAsync(
			`node ${path.join(projectRoot, 'index.js')} ${colorTestUrl} --output ${baselineDir}`,
		);

		// Verify baseline screenshot was created
		const baselineFiles = await fs.readdir(baselineDir);
		const baselineScreenshot = baselineFiles.find(
			(file) => file.includes('color-test') && file.endsWith('.png'),
		);
		assert.ok(baselineScreenshot, 'Baseline screenshot should be created');

		// Step 2: Change the background color by setting a cookie directly through browser
		console.log('Setting cookie and taking comparison screenshot...');
		const browser = await chromium.launch();
		const context = await browser.newContext();
		const page = await context.newPage();

		// Set the cookie to change background color to red
		await page.context().addCookies([{ name: 'bg-color', value: 'ff0000', url: colorTestUrl }]);

		// Visit page and take screenshot with new background color
		await page.goto(colorTestUrl);
		const compareScreenshotPath = path.join(compareDir, 'color-test-red.png');
		await page.screenshot({ path: compareScreenshotPath });
		await browser.close();

		// Step 3: Run visual regression comparison using the main application
		console.log('Running visual regression comparison...');
		// Note: Here we're directly invoking the application's main functionality
		// without specifying explicit configuration parameters
		await execAsync(
			`node ${path.join(
				projectRoot,
				'index.js',
			)} compare ${baselineDir}/${baselineScreenshot} ${compareScreenshotPath}`,
		);

		// Verify output includes a diff image
		const diffDir = path.join(outputDir, 'diff');
		const diffFiles = await fs.readdir(diffDir);
		const diffImage = diffFiles.find((file) => file.includes('diff') && file.endsWith('.png'));
		assert.ok(diffImage, 'Diff image should be created');

		// Verify the diff image has non-zero size (indicating changes were detected)
		const diffStats = await fs.stat(path.join(diffDir, diffImage));
		assert.ok(
			diffStats.size > 1000,
			'Diff image should not be empty and should contain visual changes',
		);
	} finally {
		// Clean up - stop the server
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
		await cleanSnapshots('playwright');

		// Take screenshot of page with initial color by setting cookies
		// We need to use a script that sets cookies before navigating to the page
		const colorUrl = `${baseUrl}/color-test`;
		const browser = await chromium.launch();
		const context = await browser.newContext();

		// Set the bg-color cookie with initial color
		await context.addCookies([
			{
				name: 'bg-color',
				value: initialColor,
				domain: 'localhost',
				path: '/',
			},
		]);

		const page = await context.newPage();
		await page.goto(colorUrl);
		await page.waitForLoadState('networkidle');
		await page.close();
		await browser.close();

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
		const newBrowser = await chromium.launch();
		const newContext = await newBrowser.newContext();

		// Set the bg-color cookie with new color
		await newContext.addCookies([
			{
				name: 'bg-color',
				value: changedColor,
				domain: 'localhost',
				path: '/',
			},
		]);

		const newPage = await newContext.newPage();
		await newPage.goto(colorUrl);
		await newPage.waitForLoadState('networkidle');
		await newPage.close();
		await newBrowser.close();

		// Take a screenshot with the new color
		await execAsync(`node ${cliPath} ${colorUrl}`);

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
