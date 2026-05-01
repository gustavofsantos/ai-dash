import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard.tsx";
import Sessions from "./pages/Sessions.tsx";
import SessionDetail from "./pages/SessionDetail.tsx";
import Repositories from "./pages/Repositories.tsx";
import Layout from "./components/Layout.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: "repositories",
        element: <Repositories />,
      },
      {
        path: "sessions",
        element: <Sessions />,
      },
      {
        path: "sessions/:id",
        element: <SessionDetail />,
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
