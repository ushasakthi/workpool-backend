// Runs before every e2e file, before AppModule is imported. Values set here win
// over .env, so the tests never touch the dev database.
process.env.MONGO_URI = 'mongodb://localhost:27017/workpool_e2e';

// a closed port: booking emails fail fast and are only logged, nothing lands in Mailpit
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1';
