# API REST de productos

Proyecto sencillo con Node.js, Express y `mysql2/promise` para la tabla `db_tienda_sinai.tb_productos`.

## Configuración

Necesitas Node.js 22 o superior, MySQL en ejecución y las tablas `tb_productos` y `tb_categorias` ya creadas con la estructura indicada. La API utiliza tus tablas existentes; no crea ni modifica su estructura.

Desde esta carpeta:

```bash
npm install
cp .env.example .env
```

Edita `.env` con los datos de tu conexión:

```dotenv
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_contrasena
DB_NAME=db_tienda_sinai
```

Si la contraseña contiene `#`, escríbela entre comillas. `.env` está excluido de Git.

Inicia la API:

```bash
npm run dev
```

También puedes usar `npm start` para ejecutarla sin reinicio automático. El servidor verifica la conexión a MySQL antes de empezar a escuchar en el puerto configurado.

## Endpoints

URL base: `http://localhost:3000`.

| Método | Ruta | Operación | Respuesta correcta |
| --- | --- | --- | --- |
| GET | `/api/productos` | Listar productos | `200` y arreglo JSON |
| GET | `/api/productos/:id` | Consultar un producto | `200` y objeto JSON |
| POST | `/api/productos` | Crear un producto | `201` y producto creado |
| PUT | `/api/productos/:id` | Actualizar los tres campos del producto | `200` y producto actualizado |
| DELETE | `/api/productos/:id` | Eliminar un producto | `204` sin cuerpo |

Para POST y PUT envía `Content-Type: application/json` y los tres campos:

```json
{
  "nombre": "Café molido",
  "precio": "129.90",
  "fk_clave_cat": 1
}
```

- `nombre`: entre 1 y 100 caracteres; se eliminan los espacios de los extremos.
- `precio`: número o texto decimal entre `0` y `99999999.99`, con un máximo de 2 decimales. Se devuelve como texto con dos decimales para conservar la precisión de `DECIMAL(10,2)`.
- `fk_clave_cat`: entero positivo que debe existir en `tb_categorias.pk_clave_cat`. Sustituye `1` en los ejemplos por una categoría existente.
- `pk_clave_pro`: MySQL lo genera automáticamente; no se envía en el cuerpo.

PUT requiere todos los campos, incluso si solamente deseas cambiar uno. Repetir los mismos valores sigue devolviendo `200`.

Errores habituales: `400` para datos inválidos o categoría inexistente, `404` para producto o ruta inexistente, `409` si otra tabla impide eliminar un producto, `503` si se pierde la conexión a MySQL y `500` para otros errores internos.

## Ejemplos con curl

Listar y consultar:

```bash
curl http://localhost:3000/api/productos
curl http://localhost:3000/api/productos/12
```

Crear:

```bash
curl -i -X POST http://localhost:3000/api/productos \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Café molido","precio":"129.90","fk_clave_cat":1}'
```

Actualizar (sustituye `12` por el identificador de un producto existente):

```bash
curl -X PUT http://localhost:3000/api/productos/12 \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Café molido 500 g","precio":"149.90","fk_clave_cat":1}'
```

Eliminar:

```bash
curl -i -X DELETE http://localhost:3000/api/productos/12
```

## Archivos y pruebas

- `src/db.js`: conexión a MySQL mediante un pool.
- `src/app.js`: rutas, validación y manejo de errores; las consultas usan parámetros `?`.
- `src/server.js`: inicio y cierre del servidor.
- `test/productos.test.js`: pruebas HTTP con una conexión simulada, sin modificar tu base de datos.

```bash
npm test
```

Las pruebas verifican el comportamiento HTTP, las validaciones y el manejo de errores. La conexión real requiere completar `.env` e iniciar la API con tu servidor MySQL.

## Referencias

- [Documentación oficial de Express](https://expressjs.com/en/5x/api.html)
- [Pools de conexiones de mysql2](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-pool)
