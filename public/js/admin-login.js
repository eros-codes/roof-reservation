import { api } from "./api.js";

const btn = document.getElementById("login");
const notice = document.getElementById("notice");
const passwordInput = document.getElementById("password");
if (passwordInput) {
	passwordInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") btn?.click();
	});
}

if (btn) {
	btn.addEventListener("click", async () => {
		const email = document.getElementById("email").value.trim();
		const password = document.getElementById("password").value;
		if (!email || !password) {
			notice.className = "notice danger";
			notice.textContent = "ایمیل و رمز عبور رو وارد کن.";
			return;
		}
		btn.disabled = true;
		try {
			await api("/api/admin/login", {
				method: "POST",
				body: { email, password },
			});
			location.href = "/admin.html";
		} catch (error) {
			notice.className = "notice danger";
			notice.textContent = error.message;
			btn.disabled = false;
		}
	});
}
