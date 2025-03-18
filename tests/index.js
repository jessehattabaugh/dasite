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

test('CLI crawls site when --crawl flag is provided', async () => {
	// Start local test server with multiple pages
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL and crawl flag
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Verify output contains crawling messages
		assert.match(stdout, /Starting site crawl from/);
		assert.match(stdout, /Crawling completed!/);

		// Check if screenshots exist
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Our test server has 7 pages (home, about, contact, products, products/item1, products/item2, team)
		// So we should have 7 screenshots
		assert.ok(
			screenshots.length >= 7,
			`Expected at least 7 screenshots, but got ${screenshots.length}`,
		);

		// Verify we captured specific pages
		const screenshotNames = screenshots.map((name) => name.toLowerCase());

		// Check for main page
		assert.ok(
			screenshotNames.some((name) => name.includes('localhost') && !name.includes('/')),
			'Should have screenshot of main page',
		);

		// Check for about page
		assert.ok(
			screenshotNames.some((name) => name.includes('about')),
			'Should have screenshot of about page',
		);

		// Check for products page
		assert.ok(
			screenshotNames.some((name) => name.includes('products') && !name.includes('item')),
			'Should have screenshot of products page',
		);

		// Check for product items
		assert.ok(
			screenshotNames.some((name) => name.includes('item1')),
			'Should have screenshot of product item 1',
		);
		assert.ok(
			screenshotNames.some((name) => name.includes('item2')),
			'Should have screenshot of product item 2',
		);

		// Verify screenshot files have content
		for (const screenshot of screenshots) {
			const filePath = path.join(screenshotsDir, screenshot);
			const stats = await fs.stat(filePath);
			assert.ok(
				stats.size > 1000,
				`Screenshot ${screenshot} should have reasonable file size`,
			);
		}
	} finally {
		// Always close the server
		server.close();
	}
});

test('CLI crawls site when -c shorthand flag is used', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL and shorthand flag
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} -c`);

		// Verify output contains crawling messages
		assert.match(stdout, /Starting site crawl from/);
		assert.match(stdout, /Crawling completed!/);

		// Check if multiple screenshots exist
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));
		assert.ok(screenshots.length > 1, 'Should have multiple screenshots');
	} finally {
		// Always close the server
		server.close();
	}
});

test('CLI informs about additional pages without crawling by default', async () => {
	// Start local test server with multiple pages
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with the test URL without crawl flag
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl}`);

		// Verify output contains info about additional links
		assert.match(stdout, /Found \d+ additional links on the same domain/);
		assert.match(stdout, /To crawl all pages, add the --crawl or -c flag/);

		// Check if only one screenshot exists (shouldn't crawl)
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));
		assert.equal(screenshots.length, 1, 'Should have only one screenshot without crawl flag');
	} finally {
		// Always close the server
		server.close();
	}
});

test('CLI handles pages without links correctly during crawl', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();
	const noLinksUrl = `${baseUrl}/team`; // This page has just one link back to about

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI starting from a page with minimal links
		const { stdout } = await execAsync(`node ${cliPath} ${noLinksUrl} --crawl`);

		// Verify crawling worked
		assert.match(stdout, /Crawling completed!/);

		// Verify we got more than just the starting page
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Should have more than one screenshot (team page links to about, about links to home, etc.)
		assert.ok(
			screenshots.length > 1,
			'Should crawl multiple pages even when starting from a page with few links',
		);
	} finally {
		// Always close the server
		server.close();
	}
});

test('CLI does not follow external links during crawl', async () => {
	// Start local test server
	const { server, baseUrl } = await startServer();

	try {
		// Clean any previous screenshots
		await cleanScreenshots();

		// Run CLI with crawl
		const { stdout } = await execAsync(`node ${cliPath} ${baseUrl} --crawl`);

		// Check if screenshots exist
		const files = await fs.readdir(screenshotsDir);
		const screenshots = files.filter((file) => file.endsWith('.png'));

		// Verify we don't have any screenshots from external domains
		const hasExternalScreenshots = screenshots.some(
			(name) => name.includes('example_com') || name.includes('example.com'),
		);

		assert.ok(!hasExternalScreenshots, 'Should not have screenshots of external domains');
	} finally {
		// Always close the server
		server.close();
	}
});
