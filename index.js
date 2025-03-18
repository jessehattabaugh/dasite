#!/usr/bin/env node

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function takeScreenshot(page, url, outputDir) {
  console.log(`Taking screenshot of ${url}...`);

  // Generate filename from URL
  const filename = url
    .replace(/^https?:\/\//, '')
    .replace(/[^\w\d]/g, '_')
    .replace(/_+/g, '_')
    + '.png';

  const filePath = path.join(outputDir, filename);

  // Take screenshot
  await page.screenshot({ path: filePath, fullPage: true });

  console.log(`Screenshot saved to: ${filePath}`);
  return filePath;
}

async function extractLinks(page, baseUrl) {
  // Get all links on the page
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(href => href && !href.startsWith('javascript:') && !href.startsWith('#'));
  });

  // Parse the base URL to get domain information
  const parsedBaseUrl = new URL(baseUrl);
  const baseDomain = parsedBaseUrl.hostname;

  // Filter links to include only those from the same domain
  return links.filter(link => {
    try {
      const parsedLink = new URL(link);
      return parsedLink.hostname === baseDomain;
    } catch {
      return false;
    }
  });
}

async function crawlSite(startUrl, outputDir) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Track visited URLs to avoid duplicates
  const visited = new Set();
  const queue = [startUrl];

  try {
    while (queue.length > 0) {
      const currentUrl = queue.shift();

      // Skip if already visited
      if (visited.has(currentUrl)) {
        continue;
      }

      // Mark as visited
      visited.add(currentUrl);

      try {
        // Navigate to URL
        await page.goto(currentUrl, { waitUntil: 'networkidle' });

        // Take screenshot
        await takeScreenshot(page, currentUrl, outputDir);

        // Extract links and add new ones to queue
        const links = await extractLinks(page, startUrl);
        for (const link of links) {
          if (!visited.has(link)) {
            queue.push(link);
          }
        }

        console.log(`Processed ${visited.size}/${visited.size + queue.length} pages`);
      } catch (error) {
        console.error(`Error processing ${currentUrl}: ${error.message}`);
      }
    }

    console.log(`Crawling completed! Visited ${visited.size} pages.`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: dasite <url> [--crawl|-c]');
    process.exit(1);
  }

  const startUrl = args[0];
  const outputDir = path.join(__dirname, 'screenshots');
  const shouldCrawl = args.includes('--crawl') || args.includes('-c');

  try {
    // Create screenshots directory
    await fs.mkdir(outputDir, { recursive: true });

    if (shouldCrawl) {
      console.log(`Starting site crawl from ${startUrl}...`);
      await crawlSite(startUrl, outputDir);
    } else {
      // Single page screenshot
      const browser = await chromium.launch();
      const page = await browser.newPage();

      try {
        await page.goto(startUrl, { waitUntil: 'networkidle' });
        await takeScreenshot(page, startUrl, outputDir);

        // Check for additional pages
        const links = await extractLinks(page, startUrl);
        const sameDomainLinks = links.filter(link => link !== startUrl);

        if (sameDomainLinks.length > 0) {
          console.log(`Found ${sameDomainLinks.length} additional links on the same domain.`);
          console.log('To crawl all pages, add the --crawl or -c flag:');
          console.log(`  dasite ${startUrl} --crawl`);
        }
      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
