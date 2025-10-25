// Rally Tascas Service Worker
const CACHE_NAME = 'rally-tascas-v8'; // Updated version to force cache refresh
const STATIC_CACHE_URLS = [
  '/rally/',
  '/rally/manifest.json',
  '/rally/favicon.ico',
  '/rally/icon-144.png',
  '/rally/icon-192.png',
  '/rally/icon-512.png',
  '/rally/apple-touch-icon.png',
  // Add other static assets
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation complete');
      return self.clients.claim();
    })
  );
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    console.log('Service Worker: Received skipWaiting message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.action === 'clearCache') {
    console.log('Service Worker: Clearing all caches');
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      console.log('Service Worker: All caches cleared');
    });
  }
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Only handle requests within Rally scope
  if (!event.request.url.includes('/rally/')) {
    return;
  }

  // Skip caching for API endpoints - always fetch fresh data
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Skip caching for development files (Vite HMR, etc.)
  if (event.request.url.includes('/src/') || 
      event.request.url.includes('/node_modules/') ||
      event.request.url.includes('@vite') ||
      event.request.url.includes('?v=')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Handle manifest.json requests with potential double path
  if (event.request.url.includes('manifest.json')) {
    const correctedUrl = event.request.url.replace('/rally/rally/', '/rally/');
    if (correctedUrl !== event.request.url) {
      console.log('Service Worker: Correcting manifest path:', event.request.url, '->', correctedUrl);
      event.respondWith(fetch(correctedUrl));
      return;
    }
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Only log important resources to reduce console spam
          if (event.request.url.includes('manifest.json') || 
              event.request.url.includes('sw.js') ||
              event.request.url.includes('icon-') ||
              event.request.url.includes('favicon')) {
            console.log('Service Worker: Serving from cache:', event.request.url);
          }
          return cachedResponse;
        }

        // Only log network requests for important resources
        if (event.request.url.includes('manifest.json') || 
            event.request.url.includes('sw.js') ||
            event.request.url.includes('icon-') ||
            event.request.url.includes('favicon')) {
          console.log('Service Worker: Fetching from network:', event.request.url);
        }
        return fetch(event.request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response for caching
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/rally/');
          }
        });
      })
  );
});

// Background sync for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'rally-form-sync') {
    console.log('Service Worker: Background sync triggered');
    event.waitUntil(
      // Handle offline form submissions
      handleOfflineSubmissions()
    );
  }
});

// Push notifications for Rally updates
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'Nova atualização do Rally Tascas!',
    icon: '/rally/icon-192.png',
    badge: '/rally/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 'rally-update'
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir Rally',
        icon: '/rally/icon-192.png'
      },
      {
        action: 'close',
        title: 'Fechar',
        icon: '/rally/icon-192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Rally Tascas', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/rally/')
    );
  }
});

// Helper function for offline form submissions
async function handleOfflineSubmissions() {
  try {
    // Get offline submissions from IndexedDB
    const submissions = await getOfflineSubmissions();
    
    for (const submission of submissions) {
      try {
        const response = await fetch(submission.url, {
          method: submission.method,
          headers: submission.headers,
          body: submission.body
        });
        
        if (response.ok) {
          // Remove from offline storage
          await removeOfflineSubmission(submission.id);
          console.log('Service Worker: Offline submission synced:', submission.id);
        }
      } catch (error) {
        console.error('Service Worker: Failed to sync submission:', error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Error handling offline submissions:', error);
  }
}

// IndexedDB helpers (simplified)
async function getOfflineSubmissions() {
  // Implementation would use IndexedDB
  return [];
}

async function removeOfflineSubmission(id) {
  // Implementation would remove from IndexedDB
  console.log('Service Worker: Removing offline submission:', id);
}
