const pool = require('./db');
const createApp = require('./app');

const port = Number(process.env.PORT || 3000);

async function iniciar() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT_INVALIDO');
  }

  await pool.execute('SELECT 1');
  const server = createApp(pool).listen(port, () => {
    console.log(`API disponible en http://localhost:${port}/api/productos`);
  });

  server.on('error', async (error) => {
    console.error('No se pudo iniciar el servidor:', error.code);
    await pool.end();
    process.exitCode = 1;
  });

  let cerrando = false;
  function cerrar() {
    if (cerrando) return;
    cerrando = true;
    server.close(async () => {
      await pool.end();
    });
  }
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

iniciar().catch(async (error) => {
  console.error('No se pudo iniciar la API. Revisa MySQL y tu archivo .env.', error.code || error.message);
  await pool.end();
  process.exitCode = 1;
});
