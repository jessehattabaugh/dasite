import { after, before, describe, test } from 'node:test';
import { startServer, stopServer } from '../server.js';

import assert from 'node:assert/strict';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', 'index.js');
const dasiteDir = path.join(__dirname, '..', 'dasite');

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

// Helper function to clean snapshot directories
async function cleanSnapshots(testType = 'playwright') {
	try {
		// Clean the snapshots directory
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', testType);
		await fs.mkdir(snapshotsDir, { recursive: true });
		const files = await fs.readdir(snapshotsDir);
		await Promise.all(
			files
				.filter((file) => file.endsWith('.png'))
				.map((file) => fs.unlink(path.join(snapshotsDir, file)).catch(() => {})),
		);

		// Also clean URL directories with current.png and baseline.png files
		const basePath = path.join(__dirname, '..', 'dasite');
		try {
			const entries = await fs.readdir(basePath, { withFileTypes: true });
			const urlDirs = entries
				.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
				.map((entry) => entry.name);

			for (const dir of urlDirs) {
				const urlDir = path.join(basePath, dir);
				try {
					const files = await fs.readdir(urlDir);
					for (const file of files) {
						if (file === 'current.png' || file === 'baseline.png') {
							await fs.unlink(path.join(urlDir, file)).catch(() => {});
						}
					}
				} catch (err) {
					// Ignore errors for individual directories
				}
			}
		} catch (err) {
			// Ignore errors if dasite directory doesn't exist
		}
	} catch (err) {
		console.error(`Error cleaning ${testType} snapshots:`, err);
	}
}

describe('Baseline functionality', () => {
	let serverInfo;
	const testId = 'baseline-test';

	// Setup - start server before tests
	before(async () => {
		serverInfo = await startServer({ id: testId });
		// Clean any previous screenshots and snapshots
		await cleanScreenshots();
		await cleanSnapshots('playwright');
	});

	// Teardown - stop server after tests
	after(async () => {
		await stopServer(testId);
	});

	test('📸 CLI accepts current snapshots as baselines', async () => {
		// Create the snapshots directory
		const snapshotsDir = path.join(__dirname, '..', 'dasite', 'snapshots', 'playwright');
		await fs.mkdir(snapshotsDir, { recursive: true });

		// Take screenshots
		await execAsync(`node ${cliPath} ${serverInfo.url} --crawl`);

		// Find all URL directories in dasite
		const urlEntries = await fs.readdir(dasiteDir, { withFileTypes: true });
		const urlDirectories = urlEntries
			.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
			.map((entry) => entry.name);

		console.log('Screenshots before moving:', urlDirectories);

		// Create some test .tmp.png files in the snapshots directory
		for (const urlDir of urlDirectories) {
			try {
				const sourcePath = path.join(dasiteDir, urlDir, 'current.png');
				const tmpPath = path.join(snapshotsDir, `${urlDir}.tmp.png`);
				await fs.copyFile(sourcePath, tmpPath);
			} catch (err) {
				// Skip if any errors
				continue;
			}
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
	});

	test('📸 CLI handles accepting snapshots for multiple test types', async () => {
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
	});

	test('📸 CLI shows appropriate message when no snapshots to accept', async () => {
		// Clean any previous snapshots
		await cleanSnapshots('playwright');

		// Run the accept command with an empty snapshots directory
		const { stdout } = await execAsync(`node ${cliPath} --accept`);

		// Verify output shows the appropriate message
		assert.match(stdout, /No snapshots found to accept as baselines/);
	});
});
