// FILENAME: auth.js
// handles all firebase authentication logic
// manages sign up, log-in, log out, and password reset

import { auth } from "../firebase.js";
import { db } from "../firebase.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

// USERNAME VERIFICATION
async function isUsernameTaken(username) {
    const usernameRef = doc(db, "usernames", username);
    const usernameSnap = await getDoc(usernameRef);

    return usernameSnap.exists();
}
// SIGN-UP
export async function signUp(email, password, username) {
    try {
        const taken             = await isUsernameTaken(username);
        if (taken) return "username is already taken. Please choose another.";
        const userCredential    = await createUserWithEmailAndPassword(auth, email, password);
        const user              = userCredential.user;
        await updateProfile(user, { displayName: username });
        
        // saves user info to firestore
        await setDoc(doc(db, "users", user.uid), {
            username: username,
            name: "",
            email: email,
            bio: "",
            profilePicture: "/assets/images/no-profile.png",
            dateJoined: new Date(),
            logCount: 0,
            entryCount: 0,
            stampCount: 0,
            favorites: [],
            pinnedPostId: ""
        });

        await setDoc(doc(db, "usernames", username), {
            userId: user.uid

        });


        console.log("Account created and saved to database!", user.uid);

        window.location.href = "../webpages/dashboard.html";   
    } catch (error) {
        switch(error.code) {
            case "auth/email-already-in-use":
                return "This email is already in use. Try logging in instead.";
            
            case "auth/invalid-email":
                return "Please enter a valid email address.";
            
            case "auth/weak-password":
                return "Password must be at least 6 characters.";
            
            default:
                return error.message;
        }
    }
}

// LOG-IN
export async function logIn(email, password) {
    try {
        const userCredential    = await signInWithEmailAndPassword(auth, email, password);
        const user              = userCredential.user;
        console.log("Logged in successfully!", user.uid);

        window.location.href = "../webpages/dashboard.html";
    } catch (error) {
        switch(error.code) {
            case "auth/user-not-found":
                return "No account found with this email.";

            case "auth/wrong-password":
                return "Incorrect password. Please try again.";

                
            case "auth/invalid-credential":
                return "Invalid email or password. Please try again.";
                    
            case "auth/invalid-email":
                    return "Please enter a valid email address.";

            case "auth/too-many-requests":
                return "Too many failed attempts. Please try again later.";

            default:
                return error.message;
        }
    }
}

// LOG OUT
export async function logOut() {
    try {
        // signOut clears user's session from Firebase and browser
        await signOut(auth);
        console.log("User signed out.");

        window.location.href = "log-in.html";
    } catch (error) {
        console.error("Error signing out:", error.message);
    }
}

export async function resetPassword(email) {
    try {
        // firebase sends a secure reset link to user's email
        await sendPasswordResetEmail(auth, email);
        console.log("Password reset email sent.");
        return "Check your email inbox for a password reset link.";
    } catch (error) {
        switch (error.code) {
            case "auth/user-not-found":
                return "No account found with this email.";
            case "auth/invalid-email":
                return "Please enter a valid email address.";
            default:
                return error.message;
        }
    } 
}

// AUTH STATE LISTENER
export function watchAuthState() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("User is signed in:", user.email);
        } else  {
            console.log("No user signed in. Redicrecting. . .");
            window.location.href = "log-in.html";
        }
    });
}