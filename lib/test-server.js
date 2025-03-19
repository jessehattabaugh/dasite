import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Creates and manages a test server that automatically shuts down after tests
 * @param {Object} options - Server configuration options
 * @param {number} [options.port=3000] - The port to run the server on
 * @param {string} [options.host='localhost'] - The host to bind the server to
 * @param {string} [options.contentPath] - Path to serve static content from
 * @returns {Promise<{url: string, close: Function}>} Server information and cleanup function
 */
export async function createTestServer(options = {}) {
	const port = options.port || process.env.TEST_SERVER_PORT || 3000;
	const host = options.host || process.env.TEST_SERVER_HOST || 'localhost';
	const contentPath = options.contentPath || path.join(__dirname, '..', 'test-content');

	const app = express();
	app.use(express.static(contentPath));

	// Add routes for test pages
	app.get('/linked-page', (req, res) => {
		res.send('<html><body><h1>Linked Page</h1></body></html>');
	});

	app.get('/external', (req, res) => {
		res.send('<html><body><h1>External Page</h1></body></html>');
	});

	// Create specific test scenarios
	app.get('/with-links', (req, res) => {
		res.send(`
      <html><body>
        <h1>Page with Links</h1>
        <a href="/linked-page">Internal Link</a>
        <a href="http://example.com">External Link</a>
      </body></html>
    `);
	});

	app.get('/no-links', (req, res) => {
		res.send('<html><body><h1>Page with No Links</h1></body></html>');
	});

	// Create server and proper close method
	return new Promise((resolve, reject) => {
		const server = app.listen(port, host, () => {
			console.log(`Test server running at http://${host}:${port}`);

			// Return both the URL and a close function
			resolve({
				url: `http://${host}:${port}`,
				close: () => {
					return new Promise((resolveClose) => {
						server.close(() => {
							console.log(`Test server at http://${host}:${port} shut down`);
							resolveClose();
						});
					});
				},
			});
		});

		server.on('error', reject);
	});
}
