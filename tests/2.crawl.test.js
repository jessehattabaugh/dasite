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

describe('Crawling functionality', () => {
	let serverInfo;
	const testId = 'crawl-test';

	// Setup - start server before tests
	before(async () => {
		serverInfo = await startServer({ id: testId });
		// Clean any previous screenshots
		await cleanScreenshots();
	});

	// Teardown - stop server after tests
	after(async () => {
		await stopServer(testId);
	});

	test('🕸️ CLI crawls site when --crawl flag is provided', async () => {
		// Run CLI with the test URL and crawl flag
		const { stdout } = await execAsync(`node ${cliPath} ${serverInfo.url} --crawl`);

		// Verify output contains crawling messages
		assert.match(stdout, /Starting site crawl from/);
		assert.match(stdout, /Crawling completed!/);

		// Check if URL directories were created in the dasite directory
		const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
		const urlDirectories = entries
			.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
			.map((entry) => entry.name);

		console.log('Found URL directories:', urlDirectories);

		// Our test server has multiple pages, so we should have multiple URL directories
		assert.ok(
			urlDirectories.length >= 7,
			`Expected at least 7 URL directories, but got ${urlDirectories.length}`,
		);

		// Count screenshots within those directories
		let screenshotCount = 0;
		for (const dir of urlDirectories) {
			const urlDir = path.join(dasiteDir, dir);
			try {
				const files = await fs.readdir(urlDir);
				if (files.includes('current.png')) {
					screenshotCount++;
				}
			} catch (err) {
				// Skip if can't read directory
			}
		}

		assert.ok(
			screenshotCount >= 7,
			`Expected at least 7 screenshots, but found ${screenshotCount}`,
		);
	});

	test('🕸️ CLI crawls site when -c shorthand flag is used', async () => {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL and shorthand flag
		const { stdout } = await execAsync(`node ${cliPath} ${serverInfo.url} -c`);

		// Verify output contains crawling messages
		assert.match(stdout, /Starting site crawl from/);
		assert.match(stdout, /Crawling completed!/);

		// Check if multiple directories were created
		const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
		const urlDirectories = entries
			.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
			.map((entry) => entry.name);

		assert.ok(urlDirectories.length > 1, 'Should have multiple URL directories');

		// Verify screenshots exist in these directories
		let screenshotCount = 0;
		for (const dir of urlDirectories) {
			const urlDir = path.join(dasiteDir, dir);
			try {
				const files = await fs.readdir(urlDir);
				if (files.includes('current.png')) {
					screenshotCount++;
				}
			} catch (err) {
				// Skip if we can't access the directory
			}
		}

		assert.ok(screenshotCount > 1, 'Should have multiple screenshots');
	});

	test('🔗 CLI informs about additional pages without crawling by default', async () => {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL without crawl flag
		const { stdout } = await execAsync(`node ${cliPath} ${serverInfo.url}`);

		// Verify output contains info about additional links
		assert.match(stdout, /Found \d+ additional links on the same domain/);
		assert.match(stdout, /To crawl all pages, add the --crawl or -c flag/);

		// Check if only one URL directory exists
		const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
		const urlDirectories = entries
			.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
			.map((entry) => entry.name);

		// Count actual screenshots (current.png files)
		let screenshotCount = 0;
		for (const dir of urlDirectories) {
			const urlDir = path.join(dasiteDir, dir);
			try {
				const files = await fs.readdir(urlDir);
				if (files.includes('current.png')) {
					screenshotCount++;
				}
			} catch (err) {
				// Skip if we can't access the directory
			}
		}

		assert.equal(screenshotCount, 1, 'Should have only one screenshot without crawl flag');
	});

	test('🕸️ CLI handles pages without links correctly during crawl', async () => {
		// Clean any previous screenshots
		await cleanScreenshots();

		const noLinksUrl = `${serverInfo.url}/no-links`; // Use the no-links route from the server

		// Run CLI starting from a page with minimal links
		const { stdout } = await execAsync(`node ${cliPath} ${noLinksUrl} --crawl`);

		// Verify crawling worked
		assert.match(stdout, /Crawling completed!/);

		// Verify we got the screenshot
		const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
		const urlDirectories = entries
			.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
			.map((entry) => entry.name);

		// Should have at least one URL directory
		assert.ok(
			urlDirectories.length >= 1,
			'Should crawl pages even when starting from a page with no links',
		);
	});

	test('🌐 CLI does not follow external links during crawl', async () => {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with crawl
		const { stdout } = await execAsync(`node ${cliPath} ${serverInfo.url}/with-links --crawl`);

		// Check if URL directories were created in the dasite directory
		const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
		const urlDirectories = entries
			.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
			.map((entry) => entry.name);

		// Verify we don't have any directories from external domains
		const hasExternalDirectories = urlDirectories.some(
			(name) => name.includes('example_com') || name.includes('example.com'),
		);

		assert.ok(!hasExternalDirectories, 'Should not have directories of external domains');
	});
});
