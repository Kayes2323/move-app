import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBKdOlP8nuPcqtHdQEhtjheqGN8NhJsPA4",
  authDomain: "move-app-f730d.firebaseapp.com",
  projectId: "move-app-f730d",
  storageBucket: "move-app-f730d.firebasestorage.app",
  messagingSenderId: "374674655117",
  appId: "1:374674655117:web:ac955bdd4d414d9b2d9fc4",
  measurementId: "G-XJK824WWD8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);