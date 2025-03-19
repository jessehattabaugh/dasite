import { Command } from 'commander';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

// Get package version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

/**
 * Creates and configures the CLI program
 * @returns {import('commander').Command} The configured CLI program
 */
function createProgram() {
	const program = new Command();

	program
		.name('dasite')
		.description('Capture screenshots, crawl sites, and compare changes over time')
		.version(packageJson.version)
		.argument('[url]', 'URL to capture screenshot of')
		.option('-u, --url <url>', 'URL to capture screenshot of')
		.option('-c, --crawl', 'Crawl the site and capture screenshots of all pages')
		.option('-a, --accept', 'Accept current screenshots as baselines')
		.option('--all-tests', 'Apply action to all test types (playwright, lighthouse, axe)')
		.option('--accept-all', 'Alias for --all-tests')
		.option('--compare', 'Compare current screenshots with baselines')
		.option('-o, --output <dir>', 'Output directory', './dasite')
		.option('-e, --export <path>', 'Export report to file')
		.option('-f, --format <format>', 'Format for export (pdf, html, etc.)', 'pdf')
		.option('--no-report', 'Skip report generation');

	return program;
}

/**
 * Parses command line arguments
 * @returns {Object} Parsed arguments
 */
export function parseCliArgs() {
	try {
		const program = createProgram();
		program.parse();

		const options = program.opts();
		const positionalUrl = program.args[0]; // Get the URL from the positional argument

		return {
			url: options.url || positionalUrl,
			shouldCrawl: !!options.crawl,
			shouldAccept: !!options.accept,
			shouldAcceptAllTests: !!(options.allTests || options.acceptAll),
			shouldCompare: !!options.compare,
			outputDir: options.output,
			export: options.export,
			format: options.format,
			skipReportGeneration: !options.report,
			// Provide the program for help/version etc.
			program,
		};
	} catch (error) {
		return { error };
	}
}
