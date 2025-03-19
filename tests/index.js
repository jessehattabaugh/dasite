// Import test files organized by roadmap task numbers
import './1.screenshot.test.js';
import './2.crawl.test.js';
import './3.baseline.test.js';
import './4.visual-regression.test.js';
import './5.html-report.test.js';

// Test utilities and constants
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

export const execAsync = promisify(exec);
export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '..');
export const cliPath = path.join(projectRoot, 'lib/index.js');
export const dasiteDir = path.join(projectRoot, 'dasite');

// Test utilities
export async function cleanScreenshots() {
	try {
		await fs.mkdir(dasiteDir, { recursive: true });
		const entries = await fs.readdir(dasiteDir, { withFileTypes: true }).catch(() => []);
		const directories = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);

		for (const dir of directories) {
			const urlDir = path.join(dasiteDir, dir);
			try {
				const files = await fs.readdir(urlDir);
				for (const file of files) {
					if (file.endsWith('.png')) {
						await fs.unlink(path.join(urlDir, file)).catch(() => {});
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

export async function cleanSnapshots(testType = 'playwright') {
	try {
		const snapshotsDir = path.join(dasiteDir, 'snapshots', testType);
		await fs.mkdir(snapshotsDir, { recursive: true });
		const files = await fs.readdir(snapshotsDir);
		await Promise.all(
			files
				.filter((file) => file.endsWith('.png'))
				.map((file) => fs.unlink(path.join(snapshotsDir, file)).catch(() => {})),
		);

		// Also clean URL directories
		const entries = await fs.readdir(dasiteDir, { withFileTypes: true }).catch(() => []);
		const urlDirs = entries
			.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
			.map((entry) => entry.name);

		for (const dir of urlDirs) {
			const urlDir = path.join(dasiteDir, dir);
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
		console.error(`Error cleaning ${testType} snapshots:`, err);
	}
}

export async function runCrawlTest(args) {
	try {
		const { stdout, stderr } = await execAsync(`node ${cliPath} ${args}`);
		return { code: 0, stdout, stderr };
	} catch (error) {
		return {
			code: error.code || 1,
			stdout: error.stdout || '',
			stderr: error.stderr || '',
		};
	}
}

export async function cleanup() {
	try {
		await fs.rm(dasiteDir, { recursive: true, force: true });
	} catch (err) {
		// Directory might not exist, that's okay
	}
}


// Re-export server functionality
export * from './server.js';
