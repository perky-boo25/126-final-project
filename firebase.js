  // Import the functions you need from the SDKs you need
  import { initializeApp }  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
  import { getAnalytics }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";
  import { getFirestore }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
  import { getAuth }        from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries


  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyD-UrouBNyAknf6JXlh2guSG64AslirDrA",
    authDomain: "palette-cmsc126.firebaseapp.com",
    projectId: "palette-cmsc126",
    storageBucket: "palette-cmsc126.firebasestorage.app",
    messagingSenderId: "215920491803",
    appId: "1:215920491803:web:b503ee8f38f493a70967be",
    measurementId: "G-WKGQLNCP1X"
    };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);

  //Initialize firebase products to use
  export const db   = getFirestore(app);
  export const auth = getAuth(app);

  window.db = db;
  window.firebaseAuth = auth;
