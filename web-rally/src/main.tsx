import React from "react";
import ReactDOM from "react-dom/client";
import Router from "@/router";
import "@/styles/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { refreshToken } from "./services/client";
import { OpenAPI } from "./client/core/OpenAPI";
import { useUserStore } from "@/stores/useUserStore";
import { ToastProvider } from "@/components/ui/toast";

// Configure OpenAPI BASE URL - use empty string to use relative paths
OpenAPI.BASE = '';
OpenAPI.VERSION = 'v1';

// Configure OpenAPI to use authentication token
OpenAPI.HEADERS = async () => {
  const token = useUserStore.getState().token;
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

refreshToken();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
    mutations: {
      retry: false,
    },
  },
});

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
      <ToastProvider>
        <Router />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
