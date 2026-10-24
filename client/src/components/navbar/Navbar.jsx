import React from "react";
import { NavLink, Link, useNavigate } from "react-router";
import { useAuth } from "../../contexts/authContext";

const Navbar = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    {
      name: "Home",
      to: "/",
    },
    {
      name: "Contact",
      to: "/contact",
    },
    {
      name: "About",
      to: "/about",
    },
    {
      name: "Assistant",
      to: "/assistant",
    },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  const navLinks = (
    <>
      {links.map(({ name, to }) => (
        <li key={to}>
          <NavLink
            to={to}
            className={({ isActive }) => (isActive ? "active font-bold" : "")}
          >
            {name}
          </NavLink>
        </li>
      ))}
    </>
  );

  return (
    <div className="navbar bg-base-100 shadow-sm px-4">
      {/* Navbar Start: Mobile Dropdown & Logo */}
      <div className="navbar-start">
        <div className="dropdown">
          <div tabIndex={0} role="button" className="btn btn-ghost lg:hidden">
            <svg
              aria-label="Menu"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h8m-8 6h16"
              />
            </svg>
          </div>
          <ul
            tabIndex={0}
            className="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow"
          >
            {navLinks}
          </ul>
        </div>
        <Link to="/" className="btn btn-ghost text-xl">
          My App
        </Link>
      </div>

      {/* Navbar Center: Desktop Menu */}
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1 gap-2">{navLinks}</ul>
      </div>

      {/* Navbar End: Auth Controls */}
      <div className="navbar-end">
        {!loading && user ? (
          /* User Profile Dropdown Menu */
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle avatar"
            >
              <div className="w-10 rounded-full">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user?.displayName || "User"}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="bg-neutral text-neutral-content rounded-full w-10 h-10 flex items-center justify-center font-bold">
                    {user?.displayName?.charAt(0) ||
                      user?.email?.charAt(0) ||
                      "U"}
                  </div>
                )}
              </div>
            </div>
            <ul
              tabIndex={0}
              className="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow"
            >
              <li className="menu-title px-4 py-2 border-b border-base-200">
                <span className="font-semibold text-base-content">
                  {user?.displayName || "User"}
                </span>
                <span className="text-xs text-gray-500 font-normal">
                  {user?.email}
                </span>
              </li>
              <li>
                <Link to="/profile" className="justify-between mt-2">
                  Profile
                </Link>
              </li>
              <li>
                <button onClick={handleLogout} className="text-error">
                  Logout
                </button>
              </li>
            </ul>
          </div>
        ) : (
          /* Login Button when logged out */
          <Link to="/login" className="btn btn-primary">
            Login
          </Link>
        )}
      </div>
    </div>
  );
};

export default Navbar;
