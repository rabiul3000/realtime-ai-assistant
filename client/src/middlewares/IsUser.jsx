// src/routers/GuestRoute.jsx
import { Navigate } from "react-router";
import { useAuth } from "../contexts/authContext";

const IsUser = ({ children }) => {
  const { user, loading } = useAuth();

  // Show nothing or a loading spinner while Firebase verifies the session
  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  // If user is already logged in, redirect to home page
  if (user) {
    return <Navigate to="/" replace />;
  }

  // Otherwise, allow access to the login page
  return children;
};

export default IsUser;