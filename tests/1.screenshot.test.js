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

test('CLI takes screenshot of provided URL', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl}`);

		// Verify output contains success message
		assert.match(stdout, /Screenshot saved to:/);

		// Check if screenshot was created in the dasite directory
		// Find the URL directory that should contain our screenshot
		const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
		const directories = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);

		// There should be at least one directory
		assert.ok(directories.length > 0, 'Expected at least one URL directory to be created');

		// Find a directory that contains our screenshot
		let foundScreenshot = false;
		for (const dir of directories) {
			const urlDir = path.join(dasiteDir, dir);
			const files = await fs.readdir(urlDir);

			if (files.includes('current.png')) {
				foundScreenshot = true;

				// Verify screenshot file has content
				const screenshotPath = path.join(urlDir, 'current.png');
				const fileStats = await fs.stat(screenshotPath);
				assert.ok(fileStats.size > 1000, 'Screenshot should have reasonable file size');
				break;
			}
		}

		assert.ok(foundScreenshot, 'Expected to find a screenshot in the URL directory');
	} finally {
		// Always close the server
		server.close();
	}
});

test('CLI shows usage when no URL is provided', async () => {
	try {
		await execAsync(`node ${cliPath}`);
		assert.fail('Should have thrown error');
	} catch (err) {
		assert.match(err.stderr, /Usage: dasite <url>/);
		assert.equal(err.code, 1);
	}
});

test('CLI handles invalid URLs gracefully', async () => {
	try {
		await execAsync(`node ${cliPath} http://this-is-an-invalid-domain-123456789.test`);
		assert.fail('Should have thrown error');
	} catch (err) {
		assert.match(err.stderr, /Error:/);
		assert.equal(err.code, 1);
	}
});
