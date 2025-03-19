import { cleanScreenshots, cliPath, dasiteDir, execAsync } from '../index.js';
import { describe, test } from 'node:test';

import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';

describe('Screenshot functionality', () => {
	const testUrl = 'http://localhost:3000';

	test('CLI takes screenshot of provided URL', async () => {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL
		const { stdout } = await execAsync(`node ${cliPath} ${testUrl}`);

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
	});

	test('CLI shows usage when no URL is provided', async () => {
		try {
			// Run the command without any arguments
			const { stdout, stderr } = await execAsync('node ' + cliPath);
			// If it doesn't throw, check the output for usage information
			assert.match(stdout, /Usage: dasite <url>/);
		} catch (err) {
			// If it throws (expected), check the stderr for usage information
			// Fixed to use err.stdout if available, since some error output goes to stdout
			const output = err.stdout || err.stderr || '';
			assert.match(output, /Usage: dasite <url>/);
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
});
