import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC0X0jGJTfuo_EVi5a68-sgOZVMuwwmNlo",
  authDomain: "stock-asset-manager-7cbd4.firebaseapp.com",
  projectId: "stock-asset-manager-7cbd4",
  storageBucket: "stock-asset-manager-7cbd4.firebasestorage.app",
  messagingSenderId: "650822959746",
  appId: "1:650822959746:web:8c2750fd4d05139cab2a9b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
