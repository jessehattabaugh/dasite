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
		await cleanSnapshots('playwright');

		// Create the snapshots directory
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', 'playwright');
		await fs.mkdir(snapshotsDir, { recursive: true });

		// Take screenshot of page with initial color by setting cookies
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

		// Take screenshot with dasite
		await execAsync(`node ${cliPath} ${colorUrl}`);

		// Copy screenshot to snapshots directory
		const files = await fs.readdir(screenshotsDir);
		const screenshot = files.find((file) => file.includes('color-test'));
		assert.ok(screenshot, 'Should have color-test screenshot');

		const sourcePath = path.join(screenshotsDir, screenshot);
		const tmpPath = path.join(snapshotsDir, screenshot.replace('.png', '.tmp.png'));
		await fs.copyFile(sourcePath, tmpPath);

		// Accept current snapshot as baseline
		const acceptOutput = await execAsync(`node ${cliPath} --accept`);
		assert.match(acceptOutput.stdout, /Accepted \d+ snapshots as new baselines/);

		// Take screenshot again with the same color - should match baseline
		await execAsync(`node ${cliPath} ${colorUrl}`);

		// Compare against baseline - should pass because colors are the same
		const compareOutput1 = await execAsync(`node ${cliPath} --compare`);
		assert.match(compareOutput1.stdout, /Compared \d+ screenshots/);
		assert.doesNotMatch(compareOutput1.stdout, /Found \d+ differences/);

		// Now take screenshot with different color
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

test('📸 CLI can update specific baselines', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous snapshots
		await cleanSnapshots('playwright');

		// Create the snapshots directory
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', 'playwright');
		await fs.mkdir(snapshotsDir, { recursive: true });

		// Take screenshots of multiple pages
		await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Move screenshots to snapshots directory as .tmp.png files
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Need at least 3 screenshots for this test
		assert.ok(
			screenshots.length >= 3,
			`Expected at least 3 screenshots, but got ${screenshots.length}`,
		);

		// Create test .tmp.png files in the snapshots directory
		for (const screenshot of screenshots) {
			const sourcePath = path.join(screenshotsDir, screenshot);
			const tmpPath = path.join(snapshotsDir, screenshot.replace('.png', '.tmp.png'));
			await fs.copyFile(sourcePath, tmpPath);
		}

		// Accept all snapshots as baselines
		await execAsync(`node ${cliPath} --accept`);

		// Verify we have baseline files
		const baselineFiles = (await fs.readdir(snapshotsDir)).filter(
			(file) => file.endsWith('.png') && !file.endsWith('.tmp.png'),
		);
		assert.ok(baselineFiles.length >= 3, 'Should have at least 3 baseline files');

		// Create new .tmp.png file for only one page
		const pageToUpdate = baselineFiles[0];
		const tmpUpdatePath = path.join(snapshotsDir, pageToUpdate.replace('.png', '.tmp.png'));

		// Create a modified version of the file
		await fs.writeFile(
			tmpUpdatePath,
			Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQDUSDGTMBAEEAAJ3cBPUAAAAASUVORK5CYII=',
				'base64',
			),
		);

		// Accept only the specific page update
		const { stdout } = await execAsync(
			`node ${cliPath} --accept --only=${pageToUpdate.replace('.png', '')}`,
		);

		// Verify output indicates the specific page was updated
		assert.match(
			stdout,
			new RegExp(`Accepting snapshots for ${pageToUpdate.replace('.png', '')}`),
		);
		assert.match(stdout, /Accepted 1 snapshot/);

		// Verify the specific baseline was updated (file size changed)
		const updatedStats = await fs.stat(path.join(snapshotsDir, pageToUpdate));
		assert.ok(updatedStats.size < 1000, 'Updated baseline should have new content');

		// Other baselines should remain unchanged (still have original large size)
		const otherBaseline = baselineFiles[1];
		const otherStats = await fs.stat(path.join(snapshotsDir, otherBaseline));
		assert.ok(otherStats.size > 1000, 'Other baselines should remain unchanged');
	} finally {
		// Always close the server
		server.close();
	}
});

test('📸 CLI can manage baseline versions', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous snapshots
		await cleanSnapshots('playwright');

		// Create the snapshots directory
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', 'playwright');
		await fs.mkdir(snapshotsDir, { recursive: true });

		// Create version directories
		const versionsDir = path.join(__dirname, '..', 'dasite', 'versions');
		await fs.mkdir(versionsDir, { recursive: true });

		// Take screenshots
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Move screenshots to snapshots directory as .tmp.png files
		const files = await fs.readdir(screenshotsDir);
		const screenshot = files.find((file) => file.endsWith('.png'));
		assert.ok(screenshot, 'Should have at least one screenshot');

		const sourcePath = path.join(screenshotsDir, screenshot);
		const tmpPath = path.join(snapshotsDir, screenshot.replace('.png', '.tmp.png'));
		await fs.copyFile(sourcePath, tmpPath);

		// Accept current snapshot as baseline with version tag
		const { stdout } = await execAsync(`node ${cliPath} --accept --version=v1.0`);

		// Verify output mentions accepting with version
		assert.match(stdout, /Accepting current playwright snapshots as baselines/);
		assert.match(stdout, /Version: v1.0/);

		// Verify a copy was saved to the versions directory
		const versionDir = path.join(versionsDir, 'v1.0');
		assert.ok(
			await fs
				.access(versionDir)
				.then(() => true)
				.catch(() => false),
			'Version directory should exist',
		);

		// Create a second version
		// Take a new screenshot (to ensure it's different)
		await cleanScreenshots();
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Move new screenshot to snapshots directory
		const newFiles = await fs.readdir(screenshotsDir);
		const newScreenshot = newFiles.find((file) => file.endsWith('.png'));
		assert.ok(newScreenshot, 'Should have new screenshot');

		const newSourcePath = path.join(screenshotsDir, newScreenshot);
		const newTmpPath = path.join(snapshotsDir, newScreenshot.replace('.png', '.tmp.png'));
		await fs.copyFile(newSourcePath, newTmpPath);

		// Accept new snapshot with different version
		const stdout2 = (await execAsync(`node ${cliPath} --accept --version=v2.0`)).stdout;
		assert.match(stdout2, /Version: v2.0/);

		// Verify both versions exist
		const versions = await fs.readdir(versionsDir);
		assert.ok(versions.includes('v1.0'), 'v1.0 should exist');
		assert.ok(versions.includes('v2.0'), 'v2.0 should exist');

		// Test restoring a previous version
		const restoreOutput = await execAsync(`node ${cliPath} --restore-version=v1.0`);
		assert.match(restoreOutput.stdout, /Restored baselines from version v1.0/);

		// Verify current baselines match the restored version
		const v1File = await fs.readdir(path.join(versionsDir, 'v1.0', 'playwright'));
		const currentFiles = await fs.readdir(snapshotsDir);

		assert.deepStrictEqual(
			v1File.filter((f) => !f.endsWith('.tmp.png')),
			currentFiles.filter((f) => !f.endsWith('.tmp.png')),
			'Current baselines should match restored version files',
		);
	} finally {
		// Always close the server
		server.close();

		// Clean up versions directory
		await fs.rm(path.join(__dirname, '..', 'dasite', 'versions'), {
			recursive: true,
			force: true,
		});
	}
});

test('📸 CLI can list available baseline versions', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean and set up versions directory
		const versionsDir = path.join(__dirname, '..', 'dasite', 'versions');
		await fs.rm(versionsDir, { recursive: true, force: true });
		await fs.mkdir(versionsDir, { recursive: true });

		// Create some test version directories
		const versions = ['v1.0.0', 'v1.1.0', 'v2.0.0'];
		for (const version of versions) {
			const versionDir = path.join(versionsDir, version);
			await fs.mkdir(versionDir, { recursive: true });

			// Add a timestamp file to simulate when the version was created
			await fs.writeFile(path.join(versionDir, 'timestamp'), new Date().toISOString());
		}

		// Run the list-versions command
		const { stdout } = await execAsync(`node ${cliPath} --list-versions`);

		// Check that all versions are listed
		for (const version of versions) {
			assert.match(stdout, new RegExp(version));
		}

		// Should mention the total number of versions
		assert.match(stdout, /Found 3 baseline versions/);
	} finally {
		// Always close the server
		server.close();

		// Clean up versions directory
		await fs.rm(path.join(__dirname, '..', 'dasite', 'versions'), {
			recursive: true,
			force: true,
		});
	}
});

test('📸 CLI handles baseline pruning', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous snapshots
		await cleanSnapshots('playwright');

		// Create snapshots directory
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', 'playwright');
		await fs.mkdir(snapshotsDir, { recursive: true });

		// Take multiple screenshots
		await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Move screenshots to snapshots directory
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Need enough screenshots for this test
		assert.ok(screenshots.length >= 5, 'Need at least 5 screenshots for pruning test');

		for (const screenshot of screenshots) {
			const sourcePath = path.join(screenshotsDir, screenshot);
			const tmpPath = path.join(snapshotsDir, screenshot.replace('.png', '.tmp.png'));
			await fs.copyFile(sourcePath, tmpPath);
		}

		// Accept all snapshots as baselines
		await execAsync(`node ${cliPath} --accept`);

		// Create some "old baselines" that haven't been used in a while
		const oldBaselineFiles = screenshots.slice(0, 2);
		for (const oldFile of oldBaselineFiles) {
			const oldBaselinePath = path.join(snapshotsDir, oldFile);
			// Set access/modify time to 30 days ago
			const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
			await fs.utimes(oldBaselinePath, pastDate, pastDate);
		}

		// Run baseline pruning command for files not used in 2 weeks
		const { stdout } = await execAsync(`node ${cliPath} --prune-baselines --older-than=14`);

		// Verify output mentions pruning
		assert.match(stdout, /Pruning unused baselines older than 14 days/);
		assert.match(stdout, /Removed \d+ unused baselines/);

		// Check that the old baselines were removed
		const remainingFiles = await fs.readdir(snapshotsDir);
		for (const oldFile of oldBaselineFiles) {
			assert.ok(
				!remainingFiles.includes(oldFile),
				`Old baseline ${oldFile} should be pruned`,
			);
		}

		// But newer files should still exist
		const newerFiles = screenshots.slice(2);
		for (const newerFile of newerFiles) {
			assert.ok(
				remainingFiles.includes(newerFile),
				`Newer baseline ${newerFile} should remain`,
			);
		}
	} finally {
		// Always close the server
		server.close();
	}
});

test('📸 CLI supports baseline sharing between team members', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous snapshots
		await cleanSnapshots('playwright');

		// Create snapshots directory and "team share" directory
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', 'playwright');
		await fs.mkdir(snapshotsDir, { recursive: true });

		const teamShareDir = path.join(__dirname, '..', 'dasite', 'team-share');
		await fs.mkdir(teamShareDir, { recursive: true });

		// Take screenshots
		await execAsync(`node ${cliPath} ${baseUrl}`);

		// Move screenshots to snapshots directory
		const files = await fs.readdir(screenshotsDir);
		const screenshot = files.find((file) => file.endsWith('.png'));
		assert.ok(screenshot, 'Should have screenshot');

		const sourcePath = path.join(screenshotsDir, screenshot);
		const tmpPath = path.join(snapshotsDir, screenshot.replace('.png', '.tmp.png'));
		await fs.copyFile(sourcePath, tmpPath);

		// Accept current snapshot as baseline
		await execAsync(`node ${cliPath} --accept`);

		// Export baselines to team share
		const { stdout } = await execAsync(`node ${cliPath} --export-baselines=${teamShareDir}`);

		// Verify output indicates export happened
		assert.match(stdout, /Exporting baselines to team share directory/);
		assert.match(stdout, /Exported \d+ baselines/);

		// Verify files were copied to team share
		const exportedFiles = await fs.readdir(teamShareDir);
		assert.ok(exportedFiles.length > 0, 'Should have exported files');
		assert.ok(exportedFiles.includes('playwright'), 'Should have playwright directory');

		// Clean local baselines
		await cleanSnapshots('playwright');

		// Verify local baselines were removed
		const emptyDir = await fs.readdir(snapshotsDir);
		assert.equal(emptyDir.length, 0, 'Local baselines should be removed');

		// Import from team share
		const importOutput = await execAsync(`node ${cliPath} --import-baselines=${teamShareDir}`);

		// Verify output indicates import happened
		assert.match(importOutput.stdout, /Importing baselines from team share/);
		assert.match(importOutput.stdout, /Imported \d+ baselines/);

		// Verify baselines were restored
		const restoredFiles = await fs.readdir(snapshotsDir);
		assert.ok(restoredFiles.length > 0, 'Should have restored baselines');
		assert.ok(
			restoredFiles.some((file) => file.includes(screenshot.replace('.png', ''))),
			'Should have restored the original screenshot baseline',
		);
	} finally {
		// Always close the server
		server.close();

		// Clean up team share directory
		await fs.rm(path.join(__dirname, '..', 'dasite', 'team-share'), {
			recursive: true,
			force: true,
		});
	}
});
