import { logIn, signUp } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM ready");

    const errorMsg  = document.getElementById("error-msg");
    const loginBtn  = document.getElementById("login-btn");
    const signUpBtn = document.getElementById("signup-btn");

    console.log("loginBtn:", loginBtn);
    console.log("signupBtn:", signUpBtn);

    function showError(msg) {
        errorMsg.textContent   = msg;
        errorMsg.style.display = "block";
    }

    if (loginBtn) {
        loginBtn.addEventListener("click", async () => {
            errorMsg.style.display = "none";
            const email    = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            const error    = await logIn(email, password);
            if (error) showError(error);
        });
    }

    if (signUpBtn) {
        signUpBtn.addEventListener("click", async () => {
            console.log("signup button clicked");
            errorMsg.style.display = "none";
            const username      = document.getElementById("username").value.trim();
            const email         = document.getElementById("email").value.trim();
            const password      = document.getElementById("password").value;
            if (!username) return showError("Please enter your username.");
            const error    = await signUp(email, password, username);
            if (error) showError(error);
        });
    }
});