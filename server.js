import express from 'express';
import http from 'http';

export async function startServer() {
	const app = express();

	// Home page with links to other pages
	app.get('/', (req, res) => {
		res.send(`
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
          </ul>
        </body>
      </html>
    `);
	});

	// About page
	app.get('/about', (req, res) => {
		res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>About Page</h1>
          <p>This is the about page</p>
          <a href="/">Home</a>
          <a href="/team">Team</a>
        </body>
      </html>
    `);
	});

	// Contact page
	app.get('/contact', (req, res) => {
		res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Contact Page</h1>
          <p>This is the contact page</p>
          <a href="/">Home</a>
        </body>
      </html>
    `);
	});

	// Products page
	app.get('/products', (req, res) => {
		res.send(`
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
    `);
	});

	// Product detail pages
	app.get('/products/item1', (req, res) => {
		res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Product 1</h1>
          <p>Product 1 details</p>
          <a href="/products">Back to Products</a>
        </body>
      </html>
    `);
	});

	app.get('/products/item2', (req, res) => {
		res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Product 2</h1>
          <p>Product 2 details</p>
          <a href="/products">Back to Products</a>
        </body>
      </html>
    `);
	});

	// Team page
	app.get('/team', (req, res) => {
		res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Team Page</h1>
          <p>This is the team page</p>
          <a href="/about">Back to About</a>
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