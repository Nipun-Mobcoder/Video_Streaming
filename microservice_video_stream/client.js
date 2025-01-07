const { Redis } = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

const client = new Redis({
    password: process.env.PASSWORD,
    port: process.env.PORT
});

module.exports = client;