const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const createApp = require('../src/app');

test('API de productos', async (t) => {
  const llamadas = [];
  let resultado;
  let error;
  const pool = {
    async execute(sql, valores) {
      llamadas.push({ sql, valores });
      if (error) throw error;
      return [resultado];
    },
  };
  const server = createApp(pool).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const producto = { pk_clave_pro: 12, nombre: 'Café', precio: '129.90', fk_clave_cat: 1 };

  function solicitar(ruta, metodo = 'GET', cuerpo) {
    return fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  }

  await t.test('lista productos y conserva los decimales como texto', async () => {
    resultado = [producto];
    const respuesta = await solicitar('/api/productos');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), [producto]);
  });

  await t.test('consulta un producto por id mediante un parámetro', async () => {
    resultado = [producto];
    const respuesta = await solicitar('/api/productos/12');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), producto);
    assert.deepEqual(llamadas.at(-1).valores, [12]);
    assert.match(llamadas.at(-1).sql, /WHERE pk_clave_pro = \?/);
  });

  await t.test('devuelve 404 para productos inexistentes en GET, PUT y DELETE', async () => {
    for (const metodo of ['GET', 'PUT', 'DELETE']) {
      resultado = metodo === 'GET' ? [] : { affectedRows: 0 };
      const respuesta = await solicitar('/api/productos/99', metodo, metodo === 'PUT' ? producto : undefined);
      assert.equal(respuesta.status, 404);
      assert.equal((await respuesta.json()).mensaje, 'Producto no encontrado.');
    }
  });

  await t.test('crea, normaliza y parametriza el nombre aunque contenga SQL', async () => {
    resultado = { insertId: 13 };
    const nombre = "Café'); DROP TABLE tb_productos; --";
    const respuesta = await solicitar('/api/productos', 'POST', {
      nombre: ` ${nombre} `, precio: 9.5, fk_clave_cat: 1,
    });
    assert.equal(respuesta.status, 201);
    assert.equal(respuesta.headers.get('location'), '/api/productos/13');
    assert.deepEqual(await respuesta.json(), {
      pk_clave_pro: 13, nombre, precio: '9.50', fk_clave_cat: 1,
    });
    assert.equal(llamadas.at(-1).sql.includes(nombre), false);
    assert.deepEqual(llamadas.at(-1).valores, [nombre, '9.50', 1]);
  });

  await t.test('actualiza incluso cuando los valores no cambian', async () => {
    resultado = { affectedRows: 1, changedRows: 0 };
    const respuesta = await solicitar('/api/productos/12', 'PUT', producto);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), producto);
    assert.deepEqual(llamadas.at(-1).valores, ['Café', '129.90', 1, 12]);
  });

  await t.test('elimina con respuesta 204 vacía', async () => {
    resultado = { affectedRows: 1 };
    const respuesta = await solicitar('/api/productos/12', 'DELETE');
    assert.equal(respuesta.status, 204);
    assert.equal(await respuesta.text(), '');
    assert.deepEqual(llamadas.at(-1).valores, [12]);
  });

  await t.test('rechaza cuerpos inválidos antes de consultar MySQL', async () => {
    const cuerpos = [
      {}, [], null, { ...producto, nombre: ' ' }, { ...producto, nombre: 'a'.repeat(101) },
      { ...producto, precio: -1 }, { ...producto, precio: '1.234' },
      { ...producto, precio: '100000000.00' }, { ...producto, precio: true },
      { ...producto, precio: '1e2' }, { ...producto, fk_clave_cat: '1' },
      { ...producto, fk_clave_cat: 0 }, { ...producto, fk_clave_cat: 2147483648 },
    ];
    const antes = llamadas.length;
    for (const cuerpo of cuerpos) {
      const respuesta = await solicitar('/api/productos', 'POST', cuerpo);
      assert.equal(respuesta.status, 400, JSON.stringify(cuerpo));
      await respuesta.json();
    }
    assert.equal(llamadas.length, antes);
  });

  await t.test('acepta los límites de precio y nombres Unicode', async () => {
    resultado = { insertId: 14 };
    for (const precio of ['0.00', '99999999.99']) {
      const respuesta = await solicitar('/api/productos', 'POST', {
        nombre: '☕'.repeat(100), precio, fk_clave_cat: 1,
      });
      assert.equal(respuesta.status, 201);
      assert.equal((await respuesta.json()).precio, precio);
    }
  });

  await t.test('rechaza ids inválidos sin consultar MySQL', async () => {
    const antes = llamadas.length;
    for (const id of ['0', '-1', '1.5', 'abc', '2147483648', '1%20OR%201=1']) {
      const respuesta = await solicitar(`/api/productos/${id}`);
      assert.equal(respuesta.status, 400);
      await respuesta.json();
    }
    assert.equal(llamadas.length, antes);
  });

  await t.test('informa categoría inexistente y relaciones que impiden eliminar', async () => {
    try {
      error = { code: 'ER_NO_REFERENCED_ROW_2' };
      const crear = await solicitar('/api/productos', 'POST', producto);
      assert.equal(crear.status, 400);
      assert.match((await crear.json()).mensaje, /categoría indicada no existe/);
      error = { code: 'ER_ROW_IS_REFERENCED_2' };
      const eliminar = await solicitar('/api/productos/12', 'DELETE');
      assert.equal(eliminar.status, 409);
      await eliminar.json();
    } finally {
      error = undefined;
    }
  });

  await t.test('devuelve 503 cuando MySQL no está disponible', async () => {
    error = { code: 'ECONNREFUSED' };
    try {
      const respuesta = await solicitar('/api/productos');
      assert.equal(respuesta.status, 503);
      assert.deepEqual(await respuesta.json(), { mensaje: 'No se pudo conectar con la base de datos.' });
    } finally {
      error = undefined;
    }
  });

  await t.test('devuelve JSON para errores de formato, tamaño y rutas inexistentes', async () => {
    const invalida = await fetch(`${base}/api/productos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(invalida.status, 400);
    assert.match((await invalida.json()).mensaje, /JSON válido/);
    const grande = await solicitar('/api/productos', 'POST', { nombre: 'x'.repeat(17000) });
    assert.equal(grande.status, 413);
    await grande.json();
    const ruta = await solicitar('/no-existe');
    assert.equal(ruta.status, 404);
    assert.deepEqual(await ruta.json(), { mensaje: 'Ruta no encontrada.' });
  });
});
