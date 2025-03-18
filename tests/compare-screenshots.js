// filepath: /home/jesse/dasite/tests/compare-screenshots.js
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
				.filter((file) => file.endsWith('.png') || file.endsWith('.diff.png'))
				.map((file) => fs.unlink(path.join(screenshotsDir, file))),
		);
	} catch (err) {
		console.error('Error cleaning screenshots:', err);
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

// Test with partial changes page where only some elements change
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

// Test that threshold setting works correctly for failing the process
test('CLI exits with error when changes exceed the specified threshold', async () => {
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

		// Take second screenshot which will have different colors
		await execAsync(`node ${cliPath} ${baseUrl}/random-color`);

		// Run comparison with a very low threshold that should definitely be exceeded
		// by the random color changes (1% threshold)
		try {
			await execAsync(`node ${cliPath} ${baseUrl}/random-color --compare --threshold 1`);
			assert.fail('Should have thrown error when threshold was exceeded');
		} catch (err) {
			assert.match(err.stderr, /Changes exceed threshold/);
			assert.match(err.stderr, /Threshold: 1%/);
			assert.equal(err.code, 1);
		}

		// Now try with a very high threshold that shouldn't be exceeded (99% threshold)
		const { stdout } = await execAsync(
			`node ${cliPath} ${baseUrl}/random-color --compare --threshold 99`,
		);
		assert.match(stdout, /Changes detected but within acceptable threshold/);
		assert.match(stdout, /Threshold: 99%/);

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the server
		server.close();
	}
});

// Helper function to modify the server content
async function startServerWithModifiedContent(modifier) {
	const { server, baseUrl } = await startServer();
	// Additional logic to modify server content would go here
	return { server, baseUrl };
}
