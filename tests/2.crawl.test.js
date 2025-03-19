import { cleanup, runCrawlTest, testUrl } from '../index.js';

import assert from 'node:assert';
import { test } from 'node:test';

// Clean up before tests
test.before(async () => {
	await cleanup();
});

// Clean up after tests
test.after(async () => {
	await cleanup();
});

test('🕸️ CLI crawls site by default', async () => {
	const result = await runCrawlTest(testUrl);
	assert.match(result.stdout, /Starting site crawl from http:\/\/localhost:3000/);
	assert.match(result.stdout, /Crawling completed! Visited \d+ pages/);
});

test('🕸️ CLI can crawl specific path', async () => {
	const result = await runCrawlTest(`${testUrl}/page1`);
	assert.match(result.stdout, /Starting site crawl from http:\/\/localhost:3000\/page1/);
	assert.match(result.stdout, /Crawling completed!/);
});

test('🔗 CLI skips crawling when --no-crawl flag is used', async () => {
	const result = await runCrawlTest(`${testUrl}/with-links --no-crawl`);
	assert.match(
		result.stdout,
		/Taking screenshot of http:\/\/localhost:3000\/with-links \(crawling disabled\)/,
	);
	assert.match(result.stdout, /Found \d+ additional links/);
});

test('🕸️ CLI handles pages without links correctly during crawl', async () => {
	const result = await runCrawlTest(`${testUrl}/no-links`);
	assert.match(result.stdout, /Starting site crawl from http:\/\/localhost:3000\/no-links/);
	assert.match(result.stdout, /Crawling completed!/);
});

test('🌐 CLI does not follow external links during crawl', async () => {
	const result = await runCrawlTest(`${testUrl}/with-links`);
	assert.match(result.stdout, /Starting site crawl from http:\/\/localhost:3000\/with-links/);
	assert.doesNotMatch(result.stdout, /example\.com/);
});
