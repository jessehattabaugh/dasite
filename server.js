import express from 'express';
import http from 'http';

export async function startServer(options = {}) {
	const app = express();
	const { contentModifier } = options;

	// Helper function to apply content modifier if provided
	const applyModifier = (content) => {
		return contentModifier ? contentModifier(content) : content;
	};

	// Helper function to generate random color
	const randomColor = () => {
		const r = Math.floor(Math.random() * 256);
		const g = Math.floor(Math.random() * 256);
		const b = Math.floor(Math.random() * 256);
		return `rgb(${r}, ${g}, ${b})`;
	};

	// Home page with links to other pages
	app.get('/', (req, res) => {
		res.send(
			applyModifier(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>DaSite Test Page</h1>
          <p>This is a test page for screenshot functionality</p>
          <ul>
            <li><a href="/about">About</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/products">Products</a></li>
            <li><a href="https://example.com">External Link</a></li>
            <li><a href="/random-color">Random Color Page</a></li>
            <li><a href="/random-elements">Random Elements</a></li>
            <li><a href="/partial-changes">Partial Changes</a></li>
          </ul>
        </body>
      </html>
    `),
		);
	});

	// About page
	app.get('/about', (req, res) => {
		res.send(
			applyModifier(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>About Page</h1>
          <p>This is the about page</p>
          <a href="/">Home</a>
          <a href="/team">Team</a>
        </body>
      </html>
    `),
		);
	});

	// Contact page
	app.get('/contact', (req, res) => {
		res.send(
			applyModifier(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Contact Page</h1>
          <p>This is the contact page</p>
          <a href="/">Home</a>
        </body>
      </html>
    `),
		);
	});

	// Products page
	app.get('/products', (req, res) => {
		res.send(
			applyModifier(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Products Page</h1>
          <p>This is the products page</p>
          <a href="/">Home</a>
          <a href="/products/item1">Product 1</a>
          <a href="/products/item2">Product 2</a>
        </body>
      </html>
    `),
		);
	});

	// Product detail pages
	app.get('/products/item1', (req, res) => {
		res.send(
			applyModifier(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Product 1</h1>
          <p>Product 1 details</p>
          <a href="/products">Back to Products</a>
        </body>
      </html>
    `),
		);
	});

	app.get('/products/item2', (req, res) => {
		res.send(
			applyModifier(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Product 2</h1>
          <p>Product 2 details</p>
          <a href="/products">Back to Products</a>
        </body>
      </html>
    `),
		);
	});

	// Team page
	app.get('/team', (req, res) => {
		res.send(
			applyModifier(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Team Page</h1>
          <p>This is the team page</p>
          <a href="/about">Back to About</a>
        </body>
      </html>
    `),
		);
	});

	// Random color page - changes on every load
	app.get('/random-color', (req, res) => {
		const bgColor = randomColor();
		const textColor = randomColor();

		res.send(`
      <!DOCTYPE html>
      <html>
        <body style="background-color: ${bgColor}; transition: background-color 0.5s ease;">
          <h1 style="color: ${textColor};">Random Color Page</h1>
          <p style="color: ${textColor};">This page displays random background and text colors each time it loads.</p>
          <p style="color: ${textColor};">Current background color: ${bgColor}</p>
          <p style="color: ${textColor};">Current text color: ${textColor}</p>
          <a href="/" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px;">Home</a>
          <a href="/random-color" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px; margin-left: 10px;">Reload</a>
        </body>
      </html>
    `);
	});

	// Random elements page - different elements on each load
	app.get('/random-elements', (req, res) => {
		const numElements = Math.floor(Math.random() * 10) + 1; // 1 to 10 elements
		let elements = '';

		for (let i = 0; i < numElements; i++) {
			const elementType = Math.random() > 0.5 ? 'div' : 'p';
			const bgColor = randomColor();
			const textColor = randomColor();
			const height = Math.floor(Math.random() * 100) + 20; // 20 to 120px
			const width = Math.floor(Math.random() * 80) + 20; // 20% to 100%

			elements += `
				<${elementType} style="background-color: ${bgColor}; color: ${textColor};
					height: ${height}px; width: ${width}%; margin: 10px; padding: 10px;
					display: inline-block; text-align: center;">
					Random Element #${i + 1}
				</${elementType}>
			`;
		}

		res.send(`
			<!DOCTYPE html>
			<html>
				<body>
					<h1>Random Elements Page</h1>
					<p>This page displays a random number of elements with random colors, sizes, and types.</p>
					<div id="elements-container">
						${elements}
					</div>
					<div style="margin-top: 20px;">
						<a href="/" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px;">Home</a>
						<a href="/random-elements" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px; margin-left: 10px;">Reload</a>
					</div>
				</body>
			</html>
		`);
	});

	// Partial changes page - only some elements change on reload
	app.get('/partial-changes', (req, res) => {
		const timestamp = new Date().toISOString();
		const randomNumber = Math.floor(Math.random() * 1000);

		res.send(`
			<!DOCTYPE html>
			<html>
				<body>
					<h1>Partial Changes Page</h1>
					<p>This page has some elements that change on each reload and some that stay the same.</p>
					<div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
						<h3>Static Content</h3>
						<p>This paragraph never changes.</p>
						<div>This is also static content.</div>
					</div>
					<div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
						<h3>Dynamic Content</h3>
						<p id="timestamp">Current time: ${timestamp}</p>
						<p id="random-number">Random number: ${randomNumber}</p>
						<div style="width: 100px; height: 100px; background-color: ${randomColor()};"></div>
					</div>
					<div style="margin-top: 20px;">
						<a href="/" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px;">Home</a>
						<a href="/partial-changes" style="color: white; background-color: #333; padding: 5px 10px; text-decoration: none; border-radius: 5px; margin-left: 10px;">Reload</a>
					</div>
				</body>
			</html>
		`);
	});

	const server = http.createServer(app);

	// Use environment variables or defaults
	const port = process.env.TEST_SERVER_PORT || 3000;
	const host = process.env.TEST_SERVER_HOST || 'localhost';

	await new Promise((resolve) => {
		server.listen(port, () => resolve());
	});

	const { port: actualPort } = server.address();
	const baseUrl = `http://${host}:${actualPort}`;

	return { server, baseUrl };
}