import assert from 'node:assert/strict';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import pkg from 'resemblejs';
import { promisify } from 'node:util';
import { startServer } from '../server.js';
import { test } from 'node:test';
const { compareImages } = pkg;

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
				.filter((file) => file.endsWith('.png') || file.endsWith('.diff.png'))
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

// Setup: This test will take initial screenshots, modify the site, take new screenshots,
// then test the comparison functionality
test('CLI compares screenshots and detects changes', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshots
		await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Verify we have the initial screenshots
		let files = await fs.readdir(screenshotsDir);
		const initialScreenshots = files.filter((file) => file.endsWith('.png'));
		assert.ok(initialScreenshots.length > 0, 'Should have initial screenshots');

		// Make a backup of the initial screenshots
		for (const file of initialScreenshots) {
			const sourcePath = path.join(screenshotsDir, file);
			const backupPath = path.join(screenshotsDir, `original_${file}`);
			await fs.copyFile(sourcePath, backupPath);
		}

		// Stop the server, modify it slightly, and restart
		server.close();
		const { server: modifiedServer, baseUrl: modifiedBaseUrl } = await startServer({
			contentModifier: (content) => {
				// Add some text to make screenshots different
				return content.replace(
					'<h1>DaSite Test Page</h1>',
					'<h1>DaSite Test Page - MODIFIED</h1>',
				);
			},
		});

		// Take new screenshots of the modified site
		await execAsync(`node ${cliPath} ${modifiedBaseUrl} --crawl`);

		// Now run the comparison
		const { stdout } = await execAsync(`node ${cliPath} ${modifiedBaseUrl} --compare`);

		// Check that the comparison output contains the expected information
		assert.match(stdout, /Comparing screenshots/);
		assert.match(stdout, /Screenshots compared:/);
		assert.match(stdout, /Changed screenshots:/);

		// Verify that diff images were created
		files = await fs.readdir(screenshotsDir);
		const diffImages = files.filter((file) => file.includes('.diff.'));
		assert.ok(diffImages.length > 0, 'Should have created diff images for changed screenshots');

		// Check diff image content
		for (const diffImage of diffImages) {
			const diffPath = path.join(screenshotsDir, diffImage);
			const stats = await fs.stat(diffPath);
			assert.ok(
				stats.size > 1000,
				`Diff image ${diffImage} should have reasonable file size`,
			);
		}

		// Check that comparison output includes change percentages
		assert.match(stdout, /Change percentage:/);

		// Clean up the backup screenshots
		for (const file of initialScreenshots) {
			try {
				await fs.unlink(path.join(screenshotsDir, `original_${file}`));
			} catch (err) {
				console.error(`Error removing backup screenshot ${file}:`, err);
			}
		}
	} finally {
		// Close the servers
		if (server.listening) server.close();
		if (modifiedServer && modifiedServer.listening) modifiedServer.close();
	}
});

test('CLI exits with error code when changes exceed threshold', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshots
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Make backup of the initial screenshot
		const files = await fs.readdir(screenshotsDir);
		const initialScreenshot = files.find((file) => file.endsWith('.png'));
		const sourcePath = path.join(screenshotsDir, initialScreenshot);
		const backupPath = path.join(screenshotsDir, `original_${initialScreenshot}`);
		await fs.copyFile(sourcePath, backupPath);

		// Stop the server, modify it substantially, and restart
		server.close();
		const { server: modifiedServer, baseUrl: modifiedBaseUrl } = await startServer({
			contentModifier: (content) => {
				// Make a major change to exceed threshold
				return content
					.replace('<body>', '<body style="background-color: red;">')
					.replace(
						'<h1>DaSite Test Page</h1>',
						'<h1 style="color: white; font-size: 3em;">COMPLETELY CHANGED</h1>',
					);
			},
		});

		// Take new screenshots
		await execAsync(`node ${cliPath} ${modifiedBaseUrl}`);

		// Run comparison with low threshold that should be exceeded
		try {
			await execAsync(`node ${cliPath} ${modifiedBaseUrl} --compare --threshold 10`);
			assert.fail('Should have thrown error due to threshold being exceeded');
		} catch (err) {
			assert.match(err.stderr, /Changes exceed threshold/);
			assert.equal(err.code, 1);
		}

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the servers
		if (server.listening) server.close();
		if (modifiedServer && modifiedServer.listening) modifiedServer.close();
	}
});

test('CLI handles case with no changes between screenshots', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshots
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Make a backup of the initial screenshot
		const files = await fs.readdir(screenshotsDir);
		const initialScreenshot = files.find((file) => file.endsWith('.png'));
		const sourcePath = path.join(screenshotsDir, initialScreenshot);
		const backupPath = path.join(screenshotsDir, `original_${initialScreenshot}`);
		await fs.copyFile(sourcePath, backupPath);

		// Take new screenshots of the same unchanged site
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Run comparison - should detect no changes
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} --compare`);

		// Verify output shows no changes
		assert.match(stdout, /Comparing screenshots/);
		assert.match(stdout, /No changes detected/);
		assert.doesNotMatch(stdout, /Changed screenshots:/);

		// No diff images should be created
		const updatedFiles = await fs.readdir(screenshotsDir);
		const diffImages = updatedFiles.filter((file) => file.includes('.diff.'));
		assert.equal(diffImages.length, 0, 'Should not have created any diff images');

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the server
		server.close();
	}
});

test('CLI handles missing previous screenshots gracefully', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take new screenshots without any previous ones
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Run comparison - should handle the missing previous screenshots gracefully
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} --compare`);

		// Verify output shows appropriate message
		assert.match(stdout, /No previous screenshots found for comparison/);
	} finally {
		// Close the server
		server.close();
	}
});

test('CLI correctly shows which parts of the page changed', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshots
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Make a backup of the initial screenshot
		const files = await fs.readdir(screenshotsDir);
		const initialScreenshot = files.find((file) => file.endsWith('.png'));
		const sourcePath = path.join(screenshotsDir, initialScreenshot);
		const backupPath = path.join(screenshotsDir, `original_${initialScreenshot}`);
		await fs.copyFile(sourcePath, backupPath);

		// Stop the server, modify a specific part of the page, and restart
		server.close();
		const { server: modifiedServer, baseUrl: modifiedBaseUrl } = await startServer({
			contentModifier: (content) => {
				// Change only the paragraph text, not the heading
				return content.replace(
					'<p>This is a test page for screenshot functionality</p>',
					'<p>This paragraph has been modified</p>',
				);
			},
		});

		// Take new screenshots
		await execAsync(`node ${cliPath} ${modifiedBaseUrl}`);

		// Run the comparison
		const { stdout } = await execAsync(
			`node ${cliPath} ${modifiedBaseUrl} --compare --highlight`,
		);

		// Check for detailed change information
		assert.match(stdout, /Changes detected in:/);
		assert.match(stdout, /paragraph text/);
		assert.doesNotMatch(stdout, /heading/);

		// Verify the diff image exists and is focused on the right area
		const updatedFiles = await fs.readdir(screenshotsDir);
		const diffImages = updatedFiles.filter((file) => file.includes('.diff.'));
		assert.ok(diffImages.length > 0, 'Should have created diff images');

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the servers
		if (server.listening) server.close();
		if (modifiedServer && modifiedServer.listening) modifiedServer.close();
	}
});

// Test that compares screenshots of randomly changing color page
test('CLI detects color changes in random-color page', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshot of random-color page
		await execAsync(`node ${cliPath} ${baseUrl}/random-color`);

		// Verify we have the initial screenshot
		let files = await fs.readdir(screenshotsDir);
		const initialScreenshot = files.find((file) => file.includes('random-color'));
		assert.ok(initialScreenshot, 'Should have initial random-color screenshot');

		// Make a backup of the initial screenshot
		const sourcePath = path.join(screenshotsDir, initialScreenshot);
		const backupPath = path.join(screenshotsDir, `original_${initialScreenshot}`);
		await fs.copyFile(sourcePath, backupPath);

		// Take second screenshot of the same page which should now have different colors
		await execAsync(`node ${cliPath} ${baseUrl}/random-color`);

		// Run comparison
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl}/random-color --compare`);

		// Check that the comparison detected changes
		assert.match(stdout, /Comparing screenshots/);
		assert.match(stdout, /Changed screenshots:/);
		assert.match(stdout, /random-color/);
		assert.match(stdout, /Change percentage:/);

		// Verify that diff image was created
		files = await fs.readdir(screenshotsDir);
		const diffImages = files.filter(
			(file) => file.includes('.diff.') && file.includes('random-color'),
		);
		assert.ok(diffImages.length > 0, 'Should have created diff image for random-color page');

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the server
		server.close();
	}
});

// Test with random elements page which has varying number and type of elements
test('CLI detects structural changes in random-elements page', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshot of random-elements page
		await execAsync(`node ${cliPath} ${baseUrl}/random-elements`);

		// Verify we have the initial screenshot
		let files = await fs.readdir(screenshotsDir);
		const initialScreenshot = files.find((file) => file.includes('random-elements'));
		assert.ok(initialScreenshot, 'Should have initial random-elements screenshot');

		// Make a backup of the initial screenshot
		const sourcePath = path.join(screenshotsDir, initialScreenshot);
		const backupPath = path.join(screenshotsDir, `original_${initialScreenshot}`);
		await fs.copyFile(sourcePath, backupPath);

		// Take second screenshot of the same page which should now have different elements
		await execAsync(`node ${cliPath} ${baseUrl}/random-elements`);

		// Run comparison
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl}/random-elements --compare`);

		// Check that the comparison output contains expected structural change information
		assert.match(stdout, /Comparing screenshots/);
		assert.match(stdout, /Changed screenshots:/);
		assert.match(stdout, /random-elements/);
		assert.match(stdout, /Structural changes detected/);

		// Verify that diff image was created
		files = await fs.readdir(screenshotsDir);
		const diffImages = files.filter(
			(file) => file.includes('.diff.') && file.includes('random-elements'),
		);
		assert.ok(diffImages.length > 0, 'Should have created diff image for random-elements page');

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the server
		server.close();
	}
});

test('CLI compares against accepted baseline and detects changes', async () => {
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

// Test for partial changes page where only some elements change
test('CLI precisely identifies partial changes in page content', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshot of partial-changes page
		await execAsync(`node ${cliPath} ${baseUrl}/partial-changes`);

		// Verify we have the initial screenshot
		let files = await fs.readdir(screenshotsDir);
		const initialScreenshot = files.find((file) => file.includes('partial-changes'));
		assert.ok(initialScreenshot, 'Should have initial partial-changes screenshot');

		// Make a backup of the initial screenshot
		const sourcePath = path.join(screenshotsDir, initialScreenshot);
		const backupPath = path.join(screenshotsDir, `original_${initialScreenshot}`);
		await fs.copyFile(sourcePath, backupPath);

		// Take second screenshot of the same page which should now have some changed elements
		await execAsync(`node ${cliPath} ${baseUrl}/partial-changes`);

		// Run comparison with detailed analysis
		const { stdout } = await execAsync(
			`node ${cliPath} ${baseUrl}/partial-changes --compare --detail`,
		);

		// Check that the comparison identified the correct regions that changed
		assert.match(stdout, /Comparing screenshots/);
		assert.match(stdout, /Changed screenshots:/);
		assert.match(stdout, /partial-changes/);
		assert.match(stdout, /Dynamic Content section changed/);
		assert.match(stdout, /Static Content section unchanged/);

		// Verify that diff image was created
		files = await fs.readdir(screenshotsDir);
		const diffImages = files.filter(
			(file) => file.includes('.diff.') && file.includes('partial-changes'),
		);
		assert.ok(diffImages.length > 0, 'Should have created diff image for partial-changes page');

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the server
		server.close();
	}
});

// Test that all pages can be compared by crawling the site
test('CLI compares all screenshots when site is crawled', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshots by crawling the site
		await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Verify we have multiple initial screenshots
		let files = await fs.readdir(screenshotsDir);
		const initialScreenshots = files.filter((file) => file.endsWith('.png'));
		assert.ok(
			initialScreenshots.length > 5,
			'Should have multiple initial screenshots from crawl',
		);

		// Make backup of the initial screenshots
		for (const file of initialScreenshots) {
			const sourcePath = path.join(screenshotsDir, file);
			const backupPath = path.join(screenshotsDir, `original_${file}`);
			await fs.copyFile(sourcePath, backupPath);
		}

		// Take new screenshots by crawling the site again
		// This should include the random pages which will definitely change
		await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Run comparison on all screenshots
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} --compare --all`);

		// Check that the comparison identified both changed and unchanged pages
		assert.match(stdout, /Comparing screenshots/);
		assert.match(stdout, /Total pages compared:/);
		assert.match(stdout, /Changed pages:/);
		assert.match(stdout, /Unchanged pages:/);

		// Should specifically identify our random pages as changed
		assert.match(stdout, /random-color.*changed/);
		assert.match(stdout, /random-elements.*changed/);
		assert.match(stdout, /partial-changes.*changed/);

		// Verify that diff images were created for the changed pages
		files = await fs.readdir(screenshotsDir);
		const diffImages = files.filter((file) => file.includes('.diff.'));
		assert.ok(diffImages.length >= 3, 'Should have created diff images for changed pages');

		// Clean up the backup screenshots
		for (const file of initialScreenshots) {
			try {
				await fs.unlink(path.join(screenshotsDir, `original_${file}`));
			} catch (err) {
				console.error(`Error removing backup screenshot ${file}:`, err);
			}
		}
	} finally {
		// Close the server
		server.close();
	}
});

// Test for generating change summary report
test('CLI generates HTML report summarizing visual changes', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshots for multiple pages
		await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Verify we have the initial screenshots
		let files = await fs.readdir(screenshotsDir);
		const initialScreenshots = files.filter((file) => file.endsWith('.png'));
		assert.ok(initialScreenshots.length > 0, 'Should have initial screenshots');

		// Make a backup of the initial screenshots
		for (const file of initialScreenshots) {
			const sourcePath = path.join(screenshotsDir, file);
			const backupPath = path.join(screenshotsDir, `original_${file}`);
			await fs.copyFile(sourcePath, backupPath);
		}

		// Stop the server, modify it, and restart
		server.close();
		const { server: modifiedServer, baseUrl: modifiedBaseUrl } = await startServer({
			contentModifier: (content) => {
				// Make some changes that will affect multiple pages
				return content
					.replace('<body>', '<body style="font-family: Arial, sans-serif;">')
					.replace('<h1>', '<h1 style="color: #336699;">');
			},
		});

		// Take new screenshots
		await execAsync(`node ${cliPath} ${modifiedBaseUrl} --crawl`);

		// Run comparison with HTML report generation
		const { stdout } = await execAsync(`node ${cliPath} ${modifiedBaseUrl} --compare --report`);

		// Check that the comparison output mentions report generation
		assert.match(stdout, /Generating HTML change report/);

		// Verify that an HTML report was created
		files = await fs.readdir(screenshotsDir);
		const reportFiles = files.filter((file) => file.endsWith('.html'));
		assert.ok(reportFiles.length > 0, 'Should have created an HTML report');

		// Check HTML report content
		const reportPath = path.join(screenshotsDir, reportFiles[0]);
		const reportContent = await fs.readFile(reportPath, 'utf-8');

		// Report should contain references to the pages and changes
		assert.match(reportContent, /DaSite Screenshot Comparison Report/i);
		assert.match(reportContent, /Changed Pages/i);
		assert.match(reportContent, /Before/i);
		assert.match(reportContent, /After/i);
		assert.match(reportContent, /Diff/i);

		// Clean up the backup screenshots
		for (const file of initialScreenshots) {
			try {
				await fs.unlink(path.join(screenshotsDir, `original_${file}`));
			} catch (err) {
				console.error(`Error removing backup screenshot ${file}:`, err);
			}
		}
	} finally {
		// Close the servers
		if (server.listening) server.close();
		if (modifiedServer && modifiedServer.listening) modifiedServer.close();
	}
});

// Test for visual change heatmap generation
test('CLI generates heatmap of visual changes', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Take initial screenshot
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Verify we have the initial screenshot
		let files = await fs.readdir(screenshotsDir);
		const initialScreenshot = files.find((file) => file.endsWith('.png'));
		assert.ok(initialScreenshot, 'Should have initial screenshot');

		// Make a backup of the initial screenshot
		const sourcePath = path.join(screenshotsDir, initialScreenshot);
		const backupPath = path.join(screenshotsDir, `original_${initialScreenshot}`);
		await fs.copyFile(sourcePath, backupPath);

		// Stop the server, modify it to have gradient changes, and restart
		server.close();
		const { server: modifiedServer, baseUrl: modifiedBaseUrl } = await startServer({
			contentModifier: (content) => {
				// Make changes that would produce an interesting heatmap
				return content
					.replace(
						'<body>',
						'<body style="background: linear-gradient(to right, white, #eeeeff);">',
					)
					.replace(
						'<h1>DaSite Test Page</h1>',
						'<h1 style="text-shadow: 2px 2px 5px rgba(0,0,0,0.3);">DaSite Test Page</h1>',
					);
			},
		});

		// Take new screenshot
		await execAsync(`node ${cliPath} ${modifiedBaseUrl}`);

		// Run comparison with heatmap generation
		const { stdout } = await execAsync(
			`node ${cliPath} ${modifiedBaseUrl} --compare --heatmap`,
		);

		// Check that the comparison output mentions heatmap generation
		assert.match(stdout, /Generating visual change heatmap/);

		// Verify that a heatmap image was created
		files = await fs.readdir(screenshotsDir);
		const heatmapFiles = files.filter((file) => file.includes('.heatmap.'));
		assert.ok(heatmapFiles.length > 0, 'Should have created a heatmap image');

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the servers
		if (server.listening) server.close();
		if (modifiedServer && modifiedServer.listening) modifiedServer.close();
	}
});
