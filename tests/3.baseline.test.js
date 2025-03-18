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
