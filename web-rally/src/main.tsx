import React from "react";
import ReactDOM from "react-dom/client";
import Router from "@/router";
import "@/styles/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { refreshToken } from "./services/client";

refreshToken();

const queryClient = new QueryClient();

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/rally/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
        
        // Check for updates and force activation
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker is available, force activation
                console.log('New service worker available, forcing activation...');
                newWorker.postMessage({ action: 'skipWaiting' });
                window.location.reload();
              }
            });
          }
        });
        
        // Add development utility to clear cache
        if (process.env.NODE_ENV === 'development') {
          window.clearRallyCache = () => {
            console.log('Clearing Rally cache...');
            navigator.serviceWorker.controller?.postMessage({ action: 'clearCache' });
            // Also clear browser cache
            if ('caches' in window) {
              caches.keys().then((cacheNames) => {
                return Promise.all(
                  cacheNames.map((cacheName) => caches.delete(cacheName))
                );
              }).then(() => {
                console.log('All caches cleared');
                window.location.reload();
              });
            }
          };
          console.log('Development mode: Use window.clearRallyCache() to clear all caches');
        }
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  </React.StrictMode>,
);
