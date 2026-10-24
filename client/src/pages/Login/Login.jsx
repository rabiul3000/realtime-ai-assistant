import React from "react";
import LoginButton from "../../components/buttons/LoginButton";

const Login = () => {
  

  return (
    <div className="flex justify-center items-center h-dvh w-full">
      <div className="border border-primary flex p-24 rounded-2xl">
        <LoginButton />
      </div>
    </div>
  );
};

export default Login;
