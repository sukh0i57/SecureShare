require("dotenv").config();


const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const readline = require("readline/promises");
const User = require("./models/User");

async function resetPassword() {
const rl = readline.createInterface({
input: process.stdin,
output: process.stdout,
});

try {
const email = (
await rl.question("Enter your registered email: ")
).trim().toLowerCase();

const newPassword = await rl.question(
"Enter your new password (minimum 8 characters): "
);

if (newPassword.length < 8) {
console.log("Password must be at least 8 characters.");
return;
}

await mongoose.connect(process.env.MONGODB_URI);

const user = await User.findOne({ email }).select("+password");

if (!user) {
console.log("No account found with that email.");
return;
}

user.password = await bcrypt.hash(newPassword, 12);
await user.save();

console.log("Password reset successfully!");
console.log("You can now log in with your new password.");
} catch (error) {
console.error("Password reset failed:", error.message);
} finally {
rl.close();
await mongoose.disconnect().catch(() => {});
}
}

resetPassword();