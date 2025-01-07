import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const client = new Redis({
    password: process.env.PASSWORD as string,
    port: process.env.PORT as unknown as number
});

export default client;