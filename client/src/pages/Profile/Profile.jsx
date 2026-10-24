import React from "react";
import { useAuth } from "../../contexts/authContext";
import LogoutButton from "../../components/buttons/LogoutButton";

const Profile = () => {
  const { user } = useAuth();

  return (
    <div className="flex justify-center items-center flex-col gap-8 w-full">
      <div>
        <p>{JSON.stringify(user)}</p>
      </div>
      <div>
        <LogoutButton />
      </div>
    </div>
  );
};

export default Profile;
