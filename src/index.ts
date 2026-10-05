import { loadConfig } from './config.js';
import { createHttpServer } from './http.js';

try {
  const config = loadConfig();
  const server = createHttpServer(config);
  server.on('error', () => { console.error('Não foi possível iniciar o servidor MCP.'); process.exitCode = 1; });
  server.listen(config.port, config.host, () => console.log('ACRUX ROBOCEP MCP iniciado.'));
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 10000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch {
  console.error('Configuração MCP inválida. Consulte as variáveis permitidas no README.');
  process.exitCode = 1;
}
