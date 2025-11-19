import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';

// Create MSW server for Node.js (Playwright runs in Node)
const server = setupServer(...handlers);

async function globalSetup() {
  // Start MSW server before all tests
  server.listen({ onUnhandledRequest: 'error' });
  console.log('MSW server started');
}

async function globalTeardown() {
  // Stop MSW server after all tests
  server.close();
  console.log('MSW server stopped');
}

export default globalSetup;
export { globalTeardown };

