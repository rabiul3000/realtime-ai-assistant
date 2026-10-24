import { createBrowserRouter } from "react-router";
import Home from "../pages/Home/Home";
import Login from "../pages/Login/Login";
import IsUser from "../middlewares/IsUser";
import RootLayout from "../layouts/RootLayout";
import Profile from "../pages/Profile/Profile";
import Assistant from "../pages/Assistant/Assistant";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: "login",
        element: (
          <IsUser>
            <Login />
          </IsUser>
        ),
      },
      {
        path: "profile",
        element: <Profile />,
      },
      {
        path: "assistant",
        element: <Assistant />,
      },
    ],
  },
]);

export default router;
