import express from 'express';
import http from 'http';

export async function startServer() {
  const app = express();

  // Simple test page
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>DaSite Test Page</h1>
          <p>This is a test page for screenshot functionality</p>
        </body>
      </html>
    `);
  });

  const server = http.createServer(app);
  
  // Use environment variables or defaults
  const port = process.env.TEST_SERVER_PORT || 3000;
  const host = process.env.TEST_SERVER_HOST || 'localhost';
  
  await new Promise(resolve => {
    server.listen(port, () => resolve());
  });

  const { port: actualPort } = server.address();
  const baseUrl = `http://${host}:${actualPort}`;

  return { server, baseUrl };
}