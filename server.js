import { createServer } from 'http';
import express from 'express';

/**
 * Generate a random hex color
 * @returns {string} - Random hex color like '#RRGGBB'
 */
function randomColor() {
	const hex = Math.floor(Math.random() * 16777215).toString(16);
	return `#${hex.padStart(6, '0')}`;
}

/**
 * Start a test server for running dasite tests
 * @param {Object} options - Server configuration options
 * @param {number} [options.port] - Port to use, defaults to TEST_SERVER_PORT or 3000
 * @param {string} [options.host] - Host to bind to, defaults to TEST_SERVER_HOST or localhost
 * @param {Function} [options.contentModifier] - Function to modify content before sending
 * @returns {Promise<{server: import('http').Server, baseUrl: string}>} - Server and baseUrl
 */
export async function startServer(options = {}) {
	const app = express();
	const port = options.port || process.env.TEST_SERVER_PORT || 3000;
	const host = options.host || process.env.TEST_SERVER_HOST || 'localhost';
	const contentModifier = options.contentModifier || ((content) => content);

	// Enable cookie parsing middleware (moved before routes)
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use((req, res, next) => {
		// Simple cookie parser if cookies exist in the request
		if (req.headers.cookie) {
			req.cookies = {};
			req.headers.cookie.split(';').forEach((cookie) => {
				const parts = cookie.split('=').map((part) => part.trim());
				if (parts.length === 2) {
					req.cookies[parts[0]] = parts[1];
				}
			});
		} else {
			req.cookies = {};
		}
		next();
	});

	// Home page
	app.get('/', (req, res) => {
		let content = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>DaSite Test Page</h1>
          <p>This is a test page for screenshot functionality</p>
          <nav>
            <ul>
              <li><a href="/about">About</a></li>
              <li><a href="/contact">Contact</a></li>
              <li><a href="/products">Products</a></li>
              <li><a href="/team">Team</a></li>
              <li><a href="/color-test">Color Test</a></li>
              <li><a href="/random-color">Random Color</a></li>
              <li><a href="/random-elements">Random Elements</a></li>
              <li><a href="/partial-changes">Partial Changes</a></li>
              <li><a href="https://example.com" rel="nofollow">External Link</a></li>
            </ul>
          </nav>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// About page
	app.get('/about', (req, res) => {
		let content = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>About DaSite</h1>
          <p>This is the about page for the DaSite test server.</p>
          <a href="/">Home</a>
          <a href="/team">Our Team</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Contact page
	app.get('/contact', (req, res) => {
		let content = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Contact Us</h1>
          <p>This is the contact page for the DaSite test server.</p>
          <a href="/">Home</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Products page
	app.get('/products', (req, res) => {
		let content = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Products</h1>
          <p>Browse our products:</p>
          <ul>
            <li><a href="/products/item1">Product 1</a></li>
            <li><a href="/products/item2">Product 2</a></li>
          </ul>
          <a href="/">Home</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Product item pages
	app.get('/products/:id', (req, res) => {
		const productId = req.params.id;
		let content = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Product: ${productId}</h1>
          <p>This is the page for product ${productId}.</p>
          <a href="/products">Back to Products</a>
          <a href="/">Home</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Team page
	app.get('/team', (req, res) => {
		let content = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Our Team</h1>
          <p>Meet our team members.</p>
          <a href="/about">About</a>
          <a href="/">Home</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Random color page
	app.get('/random-color', (req, res) => {
		const bgColor = randomColor();
		const textColor = randomColor();
		const buttonBg = randomColor();

		let content = `
      <!DOCTYPE html>
      <html>
        <body style="background-color: ${bgColor}; transition: none;">
          <h1 style="color: ${textColor};">Random Color Page</h1>
          <p style="color: ${textColor};">This page displays random background and text colors each time it loads.</p>
          <p style="color: ${textColor};">Current background color: ${bgColor}</p>
          <p style="color: ${textColor};">Current text color: ${textColor}</p>
          <a href="/" style="color: white; background-color: ${buttonBg}; padding: 5px 10px; text-decoration: none; border-radius: 5px;">Home</a>
          <a href="/random-color" style="color: white; background-color: ${buttonBg}; padding: 5px 10px; text-decoration: none; border-radius: 5px; margin-left: 10px;">Reload</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Color page with controllable background color via cookies
	// Use it for testing by setting cookies before requesting the page:
	// - bg-color: hex code without # (e.g., "ff0000" for red)
	// - text-color: hex code without # (e.g., "ffffff" for white)
	app.get('/color-test', (req, res) => {
		// Get colors from cookies or use defaults
		const bgColor = `#${req.cookies['bg-color'] || 'ffffff'}`;
		const textColor = `#${req.cookies['text-color'] || '000000'}`;

		res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
		res.setHeader('Pragma', 'no-cache');
		res.setHeader('Expires', '0');

		let content = `
      <!DOCTYPE html>
      <html>
        <body style="background-color: ${bgColor}; transition: none;">
          <h1 style="color: ${textColor};">Cookie-Based Color Test Page</h1>
          <p style="color: ${textColor};">This page displays colors specified in cookies.</p>
          <p style="color: ${textColor};">To change colors, set these cookies before visiting:</p>
          <ul style="color: ${textColor};">
            <li>bg-color: hex code without # (e.g., "ff0000" for red background)</li>
            <li>text-color: hex code without # (e.g., "ffffff" for white text)</li>
          </ul>
          <p style="color: ${textColor};">Current background color: ${bgColor}</p>
          <p style="color: ${textColor};">Current text color: ${textColor}</p>
          <div style="height: 300px; width: 100%;"></div>
          <a href="/" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px;">Home</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Random elements page - changes on each load
	app.get('/random-elements', (req, res) => {
		const bgColor = randomColor();
		const textColor = randomColor();
		const numElements = Math.floor(Math.random() * 10) + 1; // 1 to 10 elements
		let elements = '';

		for (let i = 0; i < numElements; i++) {
			const elementType = Math.random() > 0.5 ? 'div' : 'p';
			const height = Math.floor(Math.random() * 100) + 20; // 20 to 120px
			const width = `${Math.floor(Math.random() * 80) + 20}%`; // 20% to 100%
			elements += `<${elementType} style="background-color: ${randomColor()}; color: ${textColor}; height: ${height}px; width: ${width}; margin: 10px 0;">Random Element ${
				i + 1
			}</${elementType}>`;
		}

		let content = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1 style="color: ${textColor};">Random Elements Page</h1>
          <p style="color: ${textColor};">This page displays a random number of elements with random styles.</p>
          ${elements}
          <a href="/" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px;">Home</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Partial changes page - some parts change on each load
	app.get('/partial-changes', (req, res) => {
		const staticContent = `
      <div class="static-section">
        <h2>Static Content</h2>
        <p>This content remains the same on each page load.</p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
        </ul>
      </div>
    `;

		const dynamicContent = `
      <div class="dynamic-section">
        <h2>Dynamic Content</h2>
        <p>This content changes on each page load: ${Math.random().toString(36).substring(2, 8)}</p>
        <div style="background-color: ${randomColor()}; padding: 20px; margin: 10px 0;">
          Random colored box with timestamp: ${new Date().toISOString()}
        </div>
      </div>
    `;

		let content = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Partial Changes Page</h1>
          ${staticContent}
          ${dynamicContent}
          <a href="/" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px;">Home</a>
        </body>
      </html>
    `;

		res.send(contentModifier(content));
	});

	// Start the server
	const server = createServer(app);

	// Return a promise that resolves when the server is listening
	return new Promise((resolve) => {
		server.listen(port, host, () => {
			const baseUrl = `http://${host}:${port}`;
			console.log(`Test server running at ${baseUrl}`);
			resolve({ server, baseUrl });
		});
	});
}