import "dotenv/config";
const m = await import("./backend/mailer.js");
console.log("brevo key len:", (process.env.BREVO_API_KEY || "").length);
console.log("resend key len:", (process.env.RESEND_API_KEY || "").length);
console.log("provider:", m.activeEmailProvider());
console.log("enabled:", m.isEmailEnabled());
process.exit(0);
