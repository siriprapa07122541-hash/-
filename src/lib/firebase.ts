import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDidar_a0v-Dd6VAf_5JnQAmedaUnzmauU",
  authDomain: "impactful-objective-8xfb9.firebaseapp.com",
  projectId: "impactful-objective-8xfb9",
  storageBucket: "impactful-objective-8xfb9.firebasestorage.app",
  messagingSenderId: "794228999679",
  appId: "1:794228999679:web:70dc6f27c7cc44ffd993ca"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the custom database ID provided in config
export const db = getFirestore(app, "ai-studio-44f46f48-e769-4cd3-8c3c-8a513a9e7a33");
