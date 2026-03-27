require("dotenv").config({ path:"./.env"});
const { Pool } = require("pg");
console.log("ENV PASSWORD:", process.env.DB_PASSWORD);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,  // <-- must not be undefined
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};