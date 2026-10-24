import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBsPx_wf-TxF_4-np0dlqAf20xUhlPYf6Q",
  authDomain: "alivez.firebaseapp.com",
  projectId: "alivez",
  storageBucket: "alivez.firebasestorage.app",
  messagingSenderId: "825527691820",
  appId: "1:825527691820:web:10065ffa269e9b91e6bf89"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export default app;