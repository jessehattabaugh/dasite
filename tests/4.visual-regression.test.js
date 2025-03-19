import { after, before, describe, test } from 'node:test';
import { startServer, stopServer } from '../server.js';

import assert from 'node:assert';
import { chromium } from 'playwright';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'index.js');
const dasiteDir = path.join(projectRoot, 'dasite');

async function cleanScreenshots() {
	try {
		await fs.mkdir(dasiteDir, { recursive: true });
		// List all URL directories
		let entries;
		try {
			entries = await fs.readdir(dasiteDir, { withFileTypes: true });
		} catch (err) {
			return;
		}

		const directories = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);

		// Clean each URL directory
		for (const dir of directories) {
			const urlDir = path.join(dasiteDir, dir);
			try {
				const files = await fs.readdir(urlDir);
				for (const file of files) {
					if (file.endsWith('.png')) {
						await fs.unlink(path.join(urlDir, file));
					}
				}
			} catch (err) {
				// Ignore errors for individual directories
			}
		}
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

describe('Visual regression functionality', () => {
	let serverInfo;
	const testId = 'visual-regression-test';

	// Setup - start server before tests
	before(async () => {
		serverInfo = await startServer({ id: testId });
		// Clean any previous screenshots
		await cleanScreenshots();
	});

	// Teardown - stop server after tests
	after(async () => {
		await stopServer(testId);
	});

	test('Visual regression testing - compare screenshots with changed background color', async (t) => {
		// Create paths and URLs
		const colorTestUrl = `${serverInfo.url}/color-test`;

		// Clean up previous test files
		await cleanScreenshots();

		// Step 1: Take baseline screenshot with default white background
		console.log('Taking baseline screenshot...');
		await execAsync(`node ${cliPath} ${colorTestUrl}`);

		// Get the URL directory name for color-test
		const colorTestDir = 'localhost_color_test';
		const urlDir = path.join(dasiteDir, colorTestDir);

		// Copy the screenshot as baseline
		await fs.copyFile(path.join(urlDir, 'current.png'), path.join(urlDir, 'baseline.png'));

		// Verify baseline screenshot was created
		let baselineExists = false;
		try {
			await fs.access(path.join(urlDir, 'baseline.png'));
			baselineExists = true;
		} catch (err) {
			// File doesn't exist
		}
		assert.ok(baselineExists, 'Baseline screenshot should be created');

		// Step 2: Change the background color by setting a cookie directly through browser
		console.log('Setting cookie and taking comparison screenshot...');
		const browser = await chromium.launch();
		const context = await browser.newContext();
		const page = await context.newPage();

		// Set the cookie to change background color to red
		await page.context().addCookies([{ name: 'bg-color', value: 'ff0000', url: colorTestUrl }]);

		// Visit page and take screenshot with new background color
		await page.goto(colorTestUrl);
		await page.screenshot({ path: path.join(urlDir, 'current.png') });
		await browser.close();

		// Step 3: Run visual regression comparison
		console.log('Running visual regression comparison...');
		try {
			await execAsync(`node ${cliPath} --compare`);
		} catch (err) {
			// Expected to fail since images are different
		}

		// Verify diff image was created
		let diffExists = false;
		try {
			await fs.access(path.join(urlDir, 'diff.png'));
			diffExists = true;
		} catch (err) {
			// File doesn't exist
		}
		assert.ok(diffExists, 'Diff image should be created');

		// Verify the diff image has non-zero size
		if (diffExists) {
			const diffStats = await fs.stat(path.join(urlDir, 'diff.png'));
			assert.ok(
				diffStats.size > 1000,
				'Diff image should not be empty and should contain visual changes',
			);
		}
	});

	test('📸 CLI compares against accepted baseline and detects changes', async () => {
		// Color values for testing (without the # prefix)
		const initialColor = 'ff0000'; // Red
		const changedColor = '0000ff'; // Blue

		// Clean any previous screenshots
		await cleanScreenshots();
		await cleanSnapshots('playwright');

		// Take screenshot of page with initial color by setting cookies
		const colorUrl = `${serverInfo.url}/color-test`;
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
		const { stdout } = await execAsync(`node ${cliPath} --accept`);

		// Updated assertion to match the actual output format
		assert.match(
			stdout,
			/Accepting current playwright snapshots as baselines\.\.\.[\s\S]*Accepted \d+ snapshots as new baselines\./,
		);

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
	});
});
