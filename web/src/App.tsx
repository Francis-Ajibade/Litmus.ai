
import Landing from "./components/Landing/Landing"
import { createBrowserRouter, RouterProvider  } from "react-router"
import Litmus from "./components/Litmus/Litmus";
import { Analytics } from "@vercel/analytics/react"

// 1. Define your routing structure
const router = createBrowserRouter([
  {
    path: "/",
    element: <Landing />,
  },
  {
    path: "/sandbox",
    element: <Litmus />,
  },
]);

// 2. Render the RouterProvider component
export default function App() {
  return (
    <div>
      <RouterProvider router={router} />
      <Analytics />
    </div>

    
  );
}

