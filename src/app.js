const express = require('express');

const MAX_INT = 2147483647;
const CAMPOS = 'pk_clave_pro, nombre, precio, fk_clave_cat';

function validarProducto(req, res, next) {
  const { nombre, precio, fk_clave_cat } = req.body || {};
  const errores = [];
  const precioTexto = ['number', 'string'].includes(typeof precio) ? String(precio) : '';

  if (typeof nombre !== 'string' || !nombre.trim() || [...nombre.trim()].length > 100) {
    errores.push('nombre debe contener entre 1 y 100 caracteres.');
  }
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(precioTexto)) {
    errores.push('precio debe estar entre 0 y 99999999.99, con máximo 2 decimales.');
  }
  if (!Number.isInteger(fk_clave_cat) || fk_clave_cat < 1 || fk_clave_cat > MAX_INT) {
    errores.push('fk_clave_cat debe ser un entero positivo válido.');
  }
  if (errores.length) {
    return res.status(400).json({ mensaje: 'Datos inválidos.', errores });
  }

  // Conservar el importe como texto evita perder precisión al manejar DECIMAL.
  const [entero, decimales = ''] = precioTexto.split('.');
  req.producto = {
    nombre: nombre.trim(),
    precio: `${Number(entero)}.${decimales.padEnd(2, '0')}`,
    fk_clave_cat,
  };
  next();
}

function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/', (req, res) => {
    res.json({ mensaje: 'API de productos', productos: '/api/productos' });
  });

  app.param('id', (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || Number(id) > MAX_INT) {
      return res.status(400).json({ mensaje: 'El id debe ser un entero positivo válido.' });
    }
    req.productoId = Number(id);
    next();
  });

  app.get('/api/productos', async (req, res) => {
    const [productos] = await pool.execute(
      `SELECT ${CAMPOS} FROM tb_productos ORDER BY pk_clave_pro`,
    );
    res.json(productos);
  });

  app.get('/api/productos/:id', async (req, res) => {
    const [productos] = await pool.execute(
      `SELECT ${CAMPOS} FROM tb_productos WHERE pk_clave_pro = ?`,
      [req.productoId],
    );
    if (!productos.length) {
      return res.status(404).json({ mensaje: 'Producto no encontrado.' });
    }
    res.json(productos[0]);
  });

  app.post('/api/productos', validarProducto, async (req, res) => {
    const { nombre, precio, fk_clave_cat } = req.producto;
    const [resultado] = await pool.execute(
      'INSERT INTO tb_productos (nombre, precio, fk_clave_cat) VALUES (?, ?, ?)',
      [nombre, precio, fk_clave_cat],
    );
    res.status(201).location(`/api/productos/${resultado.insertId}`).json({
      pk_clave_pro: resultado.insertId,
      ...req.producto,
    });
  });

  app.put('/api/productos/:id', validarProducto, async (req, res) => {
    const { nombre, precio, fk_clave_cat } = req.producto;
    const [resultado] = await pool.execute(
      'UPDATE tb_productos SET nombre = ?, precio = ?, fk_clave_cat = ? WHERE pk_clave_pro = ?',
      [nombre, precio, fk_clave_cat, req.productoId],
    );
    // mysql2 incluye FOUND_ROWS: affectedRows cuenta también filas sin cambios.
    if (!resultado.affectedRows) {
      return res.status(404).json({ mensaje: 'Producto no encontrado.' });
    }
    res.json({ pk_clave_pro: req.productoId, ...req.producto });
  });

  app.delete('/api/productos/:id', async (req, res) => {
    const [resultado] = await pool.execute(
      'DELETE FROM tb_productos WHERE pk_clave_pro = ?',
      [req.productoId],
    );
    if (!resultado.affectedRows) {
      return res.status(404).json({ mensaje: 'Producto no encontrado.' });
    }
    res.status(204).end();
  });

  app.use((req, res) => {
    res.status(404).json({ mensaje: 'Ruta no encontrada.' });
  });

  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ mensaje: 'El cuerpo debe ser un JSON válido.' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ mensaje: 'El cuerpo de la petición es demasiado grande.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ mensaje: 'La categoría indicada no existe en tb_categorias.' });
    }
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ mensaje: 'El producto está relacionado con otros registros.' });
    }
    if (['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ECONNRESET'].includes(error.code)) {
      return res.status(503).json({ mensaje: 'No se pudo conectar con la base de datos.' });
    }
    console.error('Error en la API:', error.code || error.name);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  });

  return app;
}

module.exports = createApp;
