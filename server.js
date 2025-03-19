import cookieParser from 'cookie-parser';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Track server instances for each test file
const servers = new Map();
let nextServerPort = 3000;

/**
 * Starts a test server for development and testing
 * @param {Object} options - Server configuration options
 * @param {number} [options.port] - Port to run the server on
 * @param {string} [options.host] - Host to bind the server to
 * @param {string} [options.id] - Identifier for the server instance
 * @returns {Promise<Object>} Server info with URL and instance
 */
export async function startServer(options = {}) {
	// Generate an ID based on the stack trace if not provided
	const id = options.id || new Error().stack.split('\n')[2]?.trim() || Math.random().toString();

	// If there's already a server for this ID, return it
	if (servers.has(id)) {
		const existingServer = servers.get(id);
		return existingServer.info;
	}

	// Set up a unique port if not specified
	const port = options.port || process.env.TEST_SERVER_PORT || nextServerPort++;
	const host = options.host || process.env.TEST_SERVER_HOST || 'localhost';

	const app = express();

	// Add cookie parser middleware
	app.use(cookieParser());

	// Serve static files from test/fixtures if it exists
	app.use(express.static(path.join(__dirname, 'tests', 'fixtures')));

	// Add some test routes
	app.get('/', (req, res) => {
		res.send(`
			<html>
				<head><title>Test Server</title></head>
				<body>
					<h1>Test Server</h1>
					<p>This is a test page</p>
					<ul>
						<li><a href="/page1">Page 1</a></li>
						<li><a href="/page2">Page 2</a></li>
						<li><a href="/page3">Page 3</a></li>
						<li><a href="/with-links">Page with Links</a></li>
						<li><a href="/linked-page">Linked Page</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/page1', (req, res) => {
		res.send(`
			<html>
				<head><title>Page 1</title></head>
				<body>
					<h1>Page 1</h1>
					<p>This is page 1</p>
					<ul>
						<li><a href="/">Home</a></li>
						<li><a href="/page2">Page 2</a></li>
						<li><a href="/subpage1">Subpage 1</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/page2', (req, res) => {
		res.send(`
			<html>
				<head><title>Page 2</title></head>
				<body>
					<h1>Page 2</h1>
					<p>This is another test page</p>
					<ul>
						<li><a href="/">Home</a></li>
						<li><a href="/page3">Page 3</a></li>
						<li><a href="/subpage2">Subpage 2</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/page3', (req, res) => {
		res.send(`
			<html>
				<head><title>Page 3</title></head>
				<body>
					<h1>Page 3</h1>
					<p>This is page 3</p>
					<ul>
						<li><a href="/">Home</a></li>
						<li><a href="/page1">Page 1</a></li>
						<li><a href="/subpage3">Subpage 3</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/subpage1', (req, res) => {
		res.send(`
			<html>
				<head><title>Subpage 1</title></head>
				<body>
					<h1>Subpage 1</h1>
					<p>This is subpage 1</p>
					<ul>
						<li><a href="/page1">Back to Page 1</a></li>
						<li><a href="/">Home</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/subpage2', (req, res) => {
		res.send(`
			<html>
				<head><title>Subpage 2</title></head>
				<body>
					<h1>Subpage 2</h1>
					<p>This is subpage 2</p>
					<ul>
						<li><a href="/page2">Back to Page 2</a></li>
						<li><a href="/">Home</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/subpage3', (req, res) => {
		res.send(`
			<html>
				<head><title>Subpage 3</title></head>
				<body>
					<h1>Subpage 3</h1>
					<p>This is subpage 3</p>
					<ul>
						<li><a href="/page3">Back to Page 3</a></li>
						<li><a href="/">Home</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/linked-page', (req, res) => {
		res.send(`
			<html>
				<head><title>Linked Page</title></head>
				<body>
					<h1>Linked Page</h1>
					<p>This page is linked from other pages</p>
					<ul>
						<li><a href="/">Home</a></li>
						<li><a href="/with-links">Page with Links</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/with-links', (req, res) => {
		res.send(`
			<html>
				<head><title>Page with Links</title></head>
				<body>
					<h1>Page with Links</h1>
					<p>This page has various links</p>
					<ul>
						<li><a href="/linked-page">Internal Link</a></li>
						<li><a href="http://example.com">External Link</a></li>
						<li><a href="/">Home</a></li>
						<li><a href="/page1">Page 1</a></li>
					</ul>
				</body>
			</html>
		`);
	});

	app.get('/no-links', (req, res) => {
		res.send('<html><body><h1>Page with No Links</h1></body></html>');
	});

	// Special route for color test
	app.get('/color-test', (req, res) => {
		// Get background color from cookie or use default
		const bgColor = req.cookies?.['bg-color'] || 'ffffff';

		res.send(`
			<html>
				<head>
					<title>Color Test Page</title>
					<style>
						body { background-color: #${bgColor}; }
					</style>
				</head>
				<body>
					<h1>Color Test Page</h1>
					<p>This page has a configurable background color</p>
				</body>
			</html>
		`);
	});

	// Return a promise that resolves when the server starts
	return new Promise((resolve) => {
		const server = app.listen(port, host, () => {
			const serverUrl = `http://${host}:${port}`;
			console.log(`Test server running at ${serverUrl}`);

			const activeSockets = new Set();

			// Track all connections so we can force-close them if needed
			server.on('connection', (socket) => {
				activeSockets.add(socket);
				socket.on('close', () => {
					activeSockets.delete(socket);
				});
			});

			const serverInfo = {
				url: serverUrl,
				server,
				activeSockets,
				id,
				close: () => {
					return new Promise((resolveClose) => {
						server.close(() => {
							console.log(`Test server at ${serverUrl} shut down`);
							resolveClose();
						});
					});
				},
			};

			servers.set(id, {
				info: serverInfo,
				instance: server,
			});

			resolve(serverInfo);
		});
	});
}

/**
 * Stops a specific test server
 * @param {string|Object} [idOrInfo] - Server ID or server info object
 * @returns {Promise<void>} Promise that resolves when server is stopped
 */
export function stopServer(idOrInfo) {
	return new Promise((resolve) => {
		// If no id is provided, try to determine it from the call stack
		const id =
			typeof idOrInfo === 'string'
				? idOrInfo
				: idOrInfo?.id || new Error().stack.split('\n')[2]?.trim();

		// If no server with this ID exists or ID couldn't be determined
		if (!id || !servers.has(id)) {
			resolve();
			return;
		}

		const { instance, info } = servers.get(id);

		// If server isn't running, just remove from map and resolve
		if (!instance || !instance.listening) {
			servers.delete(id);
			resolve();
			return;
		}

		// Force-close all open connections
		if (info.activeSockets) {
			for (const socket of info.activeSockets) {
				socket.destroy();
			}
			info.activeSockets.clear();
		}

		instance.close((err) => {
			// Even if there's an error, we should delete the server from our map
			servers.delete(id);

			if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
				console.error('Error closing server:', err);
			}

			resolve();
		});
	});
}

// Handle process termination to ensure the server is closed when the process exits
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
	process.on(signal, async () => {
		console.log(`Received ${signal}, shutting down test servers...`);

		// Stop all active servers
		await Promise.all(Array.from(servers.keys()).map((id) => stopServer(id)));

		process.exit(0);
	});
});

// Direct script execution starts a server
if (import.meta.url === `file://${process.argv[1]}`) {
	const { url } = await startServer();
	console.log(`Test server started at ${url}`);
}
