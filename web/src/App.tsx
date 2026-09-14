
import Landing from "./components/Landing/Landing"
import { createBrowserRouter, RouterProvider  } from "react-router"
import Litmus from "./components/Litmus/Litmus";
import SignIn from "./components/Auth/SignIn";
import SandboxHome from "./components/Sandbox/Home";
import Shell, { ComingSoon } from "./components/Sandbox/Shell";
import { Analytics } from "@vercel/analytics/react"
import { WORKSPACE } from "./lib/routes"

// The routing structure.
const router = createBrowserRouter([
  {
    path: "/",
    element: <Landing />,
  },
  {
    path: "/signin",
    element: <SignIn />,
  },
  {
    path: "/sandbox",
    element: <Shell />,
    children: [
      { index: true, element: <SandboxHome /> },
      { path: "search",   element: <ComingSoon title="Search lands with saved sessions">Once runs are saved you can search them here: by problem, by course, by what broke.</ComingSoon> },
      { path: "templates", element: <ComingSoon title="Templates are coming">Starter problems you can run without pasting anything. They arrive with the September build.</ComingSoon> },
      { path: "sessions",  element: <ComingSoon title="No sessions yet">Run something and it saves here: the problem, the code, and the tests that proved it.</ComingSoon> },
      { path: "starred",   element: <ComingSoon title="Nothing starred yet">Star a session and it lands here: the ones worth reopening before an exam.</ComingSoon> },
      { path: "courses/new", element: <ComingSoon title="Courses arrive with your notes">A course holds your notes and that class's sessions, so the tutor can answer out of your own material.</ComingSoon> },
    ],
  },
  // Two entries, one component: the id lives in the URL so a refresh, the back
  // button and the sidebar highlight all work without extra state.
  {
    path: WORKSPACE,
    element: <Litmus />,
  },
  {
    path: `${WORKSPACE}/:sessionId`,
    element: <Litmus />,
  },
]);

// Render the router.
export default function App() {
  return (
    <div>
      <RouterProvider router={router} />
      <Analytics />
    </div>

    
  );
}

