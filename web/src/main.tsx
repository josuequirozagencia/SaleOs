import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthContext";
import { App } from "@/App";
import "./index.css";
import { ApiError } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetching every window focus hammers the CRM through our backend.
      refetchOnWindowFocus: false,
      // A 401 means the session ended — retrying cannot fix that, and a 404
      // means the endpoint is not there. Only retry things that might pass.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
