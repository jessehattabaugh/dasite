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

		// Check if screenshot file exists
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Verify a screenshot was created
		assert.equal(screenshots.length, 1, 'Expected one screenshot to be created');
		assert.match(screenshots[0], /localhost/, 'Screenshot filename should contain the URL');

		// Verify screenshot file has content
		const screenshotPath = path.join(screenshotsDir, screenshots[0]);
		const fileStats = await fs.stat(screenshotPath);
		assert.ok(fileStats.size > 1000, 'Screenshot should have reasonable file size');
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
