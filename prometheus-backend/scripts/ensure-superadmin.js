const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DB_URI = process.env.DB_URI || "mongodb://127.0.0.1:27017/prometheus_local";
const SUPERADMIN_LOGIN = process.env.SUPERADMIN_LOGIN || "superadmin";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "superadmin";

async function run() {
  await mongoose.connect(DB_URI);

  const users = mongoose.connection.db.collection("users");
  const now = new Date();
  const password = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);

  const result = await users.findOneAndUpdate(
    { email: SUPERADMIN_LOGIN },
    {
      $set: {
        email: SUPERADMIN_LOGIN,
        password,
        role: "superadmin",
        firstName: "Super",
        lastName: "Admin",
        emailConfirmation: true,
        isActive: true,
        phone: "000-000-0000",
        contactEmail: SUPERADMIN_LOGIN,
        isLogged: "",
        lastLoggedInRole: "superadmin",
        subscriptionEmail: false,
        updatedAt: now,
      },
      $setOnInsert: {
        previewedPosts: [],
        blacklist: [],
        messages: [],
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  const user = result.value || result || await users.findOne({ email: SUPERADMIN_LOGIN });
  console.log("Superadmin account is ready.");
  console.log(`Login: ${user.email}`);
  console.log(`Password: ${SUPERADMIN_PASSWORD}`);
  console.log(`Role: ${user.role}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failure on fatal exit
  }
  process.exit(1);
});
