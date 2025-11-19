import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';

// Create MSW server for Node.js (Playwright runs in Node)
const server = setupServer(...handlers);

async function globalTeardown() {
  // Stop MSW server after all tests
  server.close();
  console.log('MSW server stopped');
}

export default globalTeardown;

