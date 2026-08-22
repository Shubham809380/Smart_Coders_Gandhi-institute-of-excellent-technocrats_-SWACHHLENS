import "dotenv/config";
import { welcomeEmail } from "./backend/mailer.js";

// Part 1: real email to the owner's inbox via active provider
const data = await welcomeEmail({
  name: "Shubham",
  email: "shubhampatra299@gmail.com",
});
console.log("direct send result:", data ? JSON.stringify(data).slice(0, 120) : "DISABLED/FAILED");
process.exit(0);
