import { useState } from "react";
import GoogleSvg from "../../media/GoogleSvg";
import { useAuth } from "../../contexts/authContext";

const LoginButton = () => {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setError(null);
      setLoading(true);
      await loginWithGoogle();
      // Redirect or let App.jsx handle the view change automatically
    } catch (err) {
      setError("Failed to login with Google. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && <p className="text-error">{error}</p>}
      <button
        className="btn btn-wide btn-primary"
        onClick={handleLogin}
        disabled={loading}
      >
        <GoogleSvg />
        {loading ? "Signing in..." : "Login with Google"}
      </button>
    </div>
  );
};

export default LoginButton;
