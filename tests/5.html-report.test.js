import { startServer, stopServer } from '../server.js';

import assert from 'node:assert';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { test } from 'node:test';

const execAsync = promisify(exec);
const outputDir = path.join(process.cwd(), 'output');
const reportDir = path.join(outputDir, 'reports');

let server;
let serverUrl;

test('HTML Report Generation - setup test environment', async (t) => {
	// Start server with initial content
	server = await startServer({
		content: `
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Hello World</h1>
          <p>This is a test page</p>
        </body>
      </html>
    `,
	});

	serverUrl = `http://localhost:${server.port}`;

	// Ensure output directories exist
	await fs.mkdir(outputDir, { recursive: true });
	await fs.mkdir(reportDir, { recursive: true });

	// Take a baseline screenshot using the CLI
	await execAsync(`node index.js ${serverUrl} --output ${outputDir}/baseline`);

	// Change the server content
	await server.updateContent(`
    <html>
      <head><title>Test Page Updated</title></head>
      <body>
        <h1>Hello Changed World</h1>
        <p>This is an updated test page</p>
        <div>New content here</div>
      </body>
    </html>
  `);

	// Take a new screenshot for comparison
	await execAsync(`node index.js ${serverUrl} --output ${outputDir}/current`);
});

test('HTML Report Generation - generate basic HTML report', async (t) => {
	// Generate HTML report using the CLI
	await execAsync(
		`node index.js --report ${outputDir}/baseline ${outputDir}/current --output ${reportDir}`,
	);

	// Check if the HTML report was created
	try {
		await fs.access(path.join(reportDir, 'report.html'));
		assert.ok(true, 'HTML report was created');
	} catch {
		assert.fail('HTML report was not created');
	}

	// Check report content
	const reportContent = await fs.readFile(path.join(reportDir, 'report.html'), 'utf-8');
	assert.ok(reportContent.includes('baseline'), 'Report should reference baseline image');
	assert.ok(reportContent.includes('current'), 'Report should reference current image');
	assert.ok(
		reportContent.includes('diff') || reportContent.includes('comparison'),
		'Report should include comparison information',
	);
});

test('HTML Report Generation - interactive viewer features', async (t) => {
	const reportPath = path.join(reportDir, 'report.html');
	const reportContent = await fs.readFile(reportPath, 'utf-8');

	// Check for interactive elements
	const hasInteractiveElements =
		reportContent.includes('<script') ||
		reportContent.includes('onclick') ||
		reportContent.includes('addEventListener') ||
		reportContent.includes('slider') ||
		reportContent.includes('toggle');

	assert.ok(
		hasInteractiveElements,
		'Report should contain interactive elements for comparing images',
	);

	// Verify the report has sufficient interactivity
	assert.ok(
		reportContent.includes('mousemove') ||
			reportContent.includes('drag') ||
			reportContent.includes('slider'),
		'Report should contain image comparison interactivity',
	);
});

test('HTML Report Generation - export to PDF format', async (t) => {
	// Export to PDF using CLI
	await execAsync(
		`node index.js --export pdf ${reportDir}/report.html --output ${reportDir}/report.pdf`,
	);

	// Check if the PDF was created
	try {
		await fs.access(path.join(reportDir, 'report.pdf'));
		assert.ok(true, 'PDF report was created');
	} catch {
		assert.fail('PDF report was not created');
	}
});

test('HTML Report Generation - export to JSON format', async (t) => {
	// Export to JSON using CLI
	await execAsync(
		`node index.js --export json ${reportDir}/report.html --output ${reportDir}/report.json`,
	);

	// Check if the JSON was created
	try {
		await fs.access(path.join(reportDir, 'report.json'));
		assert.ok(true, 'JSON report was created');
	} catch {
		assert.fail('JSON report was not created');
	}

	// Verify JSON content is valid and has expected structure
	const jsonContent = JSON.parse(await fs.readFile(path.join(reportDir, 'report.json'), 'utf-8'));
	assert.ok(jsonContent.hasOwnProperty('baseline'), 'JSON should contain baseline image info');
	assert.ok(jsonContent.hasOwnProperty('current'), 'JSON should contain current image info');
	assert.ok(jsonContent.hasOwnProperty('differences'), 'JSON should contain difference info');
});

test('HTML Report Generation - export to Markdown format', async (t) => {
	// Export to Markdown using CLI
	await execAsync(
		`node index.js --export markdown ${reportDir}/report.html --output ${reportDir}/report.md`,
	);

	// Check if the Markdown was created
	try {
		await fs.access(path.join(reportDir, 'report.md'));
		assert.ok(true, 'Markdown report was created');
	} catch {
		assert.fail('Markdown report was not created');
	}

	// Check Markdown content
	const mdContent = await fs.readFile(path.join(reportDir, 'report.md'), 'utf-8');
	assert.ok(
		mdContent.includes('# Visual Comparison Report') ||
			mdContent.includes('## Visual Comparison'),
		'Markdown should have proper heading',
	);
	assert.ok(mdContent.includes('!['), 'Markdown should contain image references');
});

test('HTML Report Generation - cleanup', async (t) => {
	await stopServer(server);
});
