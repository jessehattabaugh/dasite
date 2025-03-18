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

// Test for pixel-level highlighting in diff images
test('CLI creates diff images with highlighted changed pixels', async () => {
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

		// Stop the server, modify a specific element, and restart
		server.close();
		const { server: modifiedServer, baseUrl: modifiedBaseUrl } = await startServer({
			contentModifier: (content) => {
				// Make a small but visible change to a specific element
				return content.replace(
					'<p>This is a test page for screenshot functionality</p>',
					'<p style="background-color: yellow; color: red;">This is a test page for screenshot functionality</p>',
				);
			},
		});

		// Take new screenshot
		await execAsync(`node ${cliPath} ${modifiedBaseUrl}`);

		// Run comparison with pixel highlighting
		const { stdout } = await execAsync(
			`node ${cliPath} ${modifiedBaseUrl} --compare --highlight-pixels`,
		);

		// Check that the comparison output mentions pixel highlighting
		assert.match(stdout, /Comparing screenshots with pixel-level highlighting/);

		// Verify that a highlighted diff image was created
		files = await fs.readdir(screenshotsDir);
		const diffImages = files.filter((file) => file.includes('.diff.'));
		assert.ok(diffImages.length > 0, 'Should have created diff image with highlighted pixels');

		// Check that the diff image has content with the right indicators
		const diffPath = path.join(screenshotsDir, diffImages[0]);
		const stats = await fs.stat(diffPath);
		assert.ok(stats.size > 5000, 'Highlighted diff image should have substantial content');

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the servers
		if (server.listening) server.close();
		if (modifiedServer && modifiedServer.listening) modifiedServer.close();
	}
});

// Test for detailed change regions reporting
test('CLI reports detailed information about changed regions', async () => {
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

		// Stop the server, modify it to have multiple distinct changes, and restart
		server.close();
		const { server: modifiedServer, baseUrl: modifiedBaseUrl } = await startServer({
			contentModifier: (content) => {
				// Make multiple changes to different areas
				return content
					.replace(
						'<h1>DaSite Test Page</h1>',
						'<h1 style="color: blue;">DaSite Test Page - Updated</h1>',
					)
					.replace(
						'<p>This is a test page for screenshot functionality</p>',
						'<p style="background-color: #ffeeee;">This is a modified paragraph</p>',
					)
					.replace('<body>', '<body style="padding: 20px;">');
			},
		});

		// Take new screenshot
		await execAsync(`node ${cliPath} ${modifiedBaseUrl}`);

		// Run comparison with detailed regions reporting
		const { stdout } = await execAsync(
			`node ${cliPath} ${modifiedBaseUrl} --compare --detail-regions`,
		);

		// Check that the comparison output contains detailed region information
		assert.match(stdout, /Comparing screenshots with region analysis/);
		assert.match(stdout, /Changed regions:/);
		assert.match(stdout, /Region 1:/);
		assert.match(stdout, /coordinates:/);
		assert.match(stdout, /approximate size:/);

		// Verify that the output contains information about multiple regions
		const regionsMatches = stdout.match(/Region \d+:/g);
		assert.ok(
			regionsMatches.length >= 2,
			'Should identify at least 2 separate changed regions',
		);

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
	} finally {
		// Close the servers
		if (server.listening) server.close();
		if (modifiedServer && modifiedServer.listening) modifiedServer.close();
	}
});

// Test for element-level change detection
test('CLI identifies which HTML elements have changed', async () => {
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

		// Stop the server, modify specific elements, and restart
		server.close();
		const { server: modifiedServer, baseUrl: modifiedBaseUrl } = await startServer({
			contentModifier: (content) => {
				// Modify specific elements with identifiable attributes
				return content
					.replace(
						'<h1>DaSite Test Page</h1>',
						'<h1 id="main-title">DaSite Test Page</h1>',
					)
					.replace(
						'<p>This is a test page for screenshot functionality</p>',
						'<p id="description">This is a modified test page for screenshot comparison</p>',
					);
			},
		});

		// Take new screenshot
		await execAsync(`node ${cliPath} ${modifiedBaseUrl}`);

		// Run comparison with element identification
		const { stdout } = await execAsync(
			`node ${cliPath} ${modifiedBaseUrl} --compare --identify-elements`,
		);

		// Check that the comparison output identifies changed elements
		assert.match(stdout, /Comparing screenshots with element identification/);
		assert.match(stdout, /Changed elements:/);

		// Should identify specific elements that changed
		assert.match(stdout, /Element: (p|h1)/);
		assert.match(stdout, /(id|selector):/);
		assert.match(stdout, /Change type:/);

		// Clean up the backup screenshot
		await fs.unlink(backupPath);
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

// Helper function to modify the server content
async function startServerWithModifiedContent(modifier) {
	const { server, baseUrl } = await startServer();
	// Additional logic to modify server content would go here
	return { server, baseUrl };
}
