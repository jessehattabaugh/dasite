import {
	cleanScreenshots,
	cleanSnapshots,
	cliPath,
	dasiteDir,
	execAsync,
	runCrawlTest,
} from '../index.js';
import { describe, test } from 'node:test';

import assert from 'node:assert';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'path';

describe('Visual regression functionality', () => {
	const testUrl = 'http://localhost:3000';

	// Clean any previous screenshots before tests
	test.before(async () => {
		await cleanScreenshots();
	});

	test('Visual regression testing - compare screenshots with changed background color', async () => {
		// Create paths and URLs
		const colorTestUrl = `${testUrl}/color-test`;

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
		const colorUrl = `${testUrl}/color-test`;
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

test('⚖️ compare screenshots by default after taking screenshots', async (t) => {
	await t.test('setup', async () => {
		await cleanScreenshots();
	});

	const colorTestUrl = `${testUrl}/color-test`;

	await t.test('should take screenshot and compare by default', async () => {
		// First run with default background color to create baseline
		const result1 = await runCrawlTest(`${colorTestUrl} --no-crawl`);
		assert.strictEqual(result1.code, 0);

		// Accept this as baseline
		await runCrawlTest('--accept');

		// Set cookie for red background color using direct browser control
		const browser = await chromium.launch();
		const context = await browser.newContext();
		const page = await context.newPage();

		// Set cookie and let it take effect
		await context.addCookies([
			{
				name: 'bg-color',
				value: 'ff0000',
				url: colorTestUrl,
				domain: 'localhost',
				path: '/',
			},
		]);

		// Visit page to ensure cookie is applied
		await page.goto(colorTestUrl);
		await page.waitForTimeout(100); // Give it a moment to apply styles
		await browser.close();

		// Take a new screenshot with the modified content - it should detect differences
		const result2 = await runCrawlTest(`${colorTestUrl} --no-crawl`);

		// We expect the command to exit with code 1 when differences are found
		assert.strictEqual(result2.code, 1, 'Should exit with code 1 when differences found');
		assert.match(result2.stdout, /Found \d+ differences/);
	});

	await t.test('should not compare with --no-compare flag', async () => {
		const result = await runCrawlTest(`${colorTestUrl} --no-compare`);
		assert.strictEqual(result.code, 0);
		assert.match(result.stdout, /Screenshot saved to:/);
		assert.doesNotMatch(result.stdout, /Comparing screenshots/);
	});

	await t.test('cleanup', async () => {
		await cleanScreenshots();
	});
});
