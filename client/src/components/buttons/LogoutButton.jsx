import { useAuth } from "../../contexts/authContext";

const LogoutButton = () => {
  const { logout, loading } = useAuth();

  return (
    <div>
      <button
        className="btn btn-wide btn-error"
        onClick={logout}
        disabled={loading}
      >
        {loading ? "Please wait" : "Logout"}
      </button>
    </div>
  );
};

export default LogoutButton;
