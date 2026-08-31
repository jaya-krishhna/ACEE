import app from './app';
import { config } from './config';

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`[Server]: Server is running in ${config.nodeEnv} mode at http://localhost:${PORT}`);
  console.log(`[Server]: Swagger documentation is available at http://localhost:${PORT}/api-docs`);
});
