import { api } from "./api.js";

const btn = document.getElementById("login");
const notice = document.getElementById("notice");

if (btn) {
	btn.addEventListener("click", async () => {
		const email = document.getElementById("email").value.trim();
		const password = document.getElementById("password").value.trim();
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
