// config.js — Central configuration loaded from environment variables.
// This file runs FIRST when the app starts. It reads .env and exports
// all secrets/settings so every other file uses the same values.

require('dotenv').config(); // loads .env file into process.env

// If JWT_SECRET is missing, crash immediately instead of running with a fake secret
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET,       // secret key used to sign/verify login tokens
  JWT_EXPIRES: '7d',                         // how long a login token stays valid
  PORT: process.env.PORT || 5000,            // which port the server listens on
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5000' // which website is allowed to call the API
};
