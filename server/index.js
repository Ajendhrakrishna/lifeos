import { app } from './app.js';

const port = process.env.PORT || 3000;

// 127.0.0.1 = only this computer can reach the app
app.listen(port, '127.0.0.1', () => {
  console.log(`LifeOS running at http://localhost:${port}`);
});
