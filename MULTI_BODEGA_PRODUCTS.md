# Multi-Bodega Product Registration

## Overview
Esta funcionalidad permite a los bodegueros crear un producto en múltiples bodegas simultáneamente. Cada producto creado es independiente (con su propio stock, precio y disponibilidad) pero comparte las mismas imágenes y datos básicos.

## Endpoint

### POST /api/products

**Autorización:** Bearer token (rol: BODEGA_OWNER)

**Request Body:**
```json
{
  "bodegaIds": ["bodega-id-1", "bodega-id-2", "bodega-id-3"],
  "name": "Coca Cola 2L",
  "description": "Bebida refrescante",
  "category": "Bebidas",
  "subcategory": "Gaseosas",
  "price": 2.50,
  "discountPrice": 2.00,
  "stock": 100,
  "images": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ],
  "isAvailable": true
}
```

**Response (201 Created):**
```json
{
  "data": [
    {
      "id": "clx1234567890",
      "bodegaId": "bodega-id-1",
      "name": "Coca Cola 2L",
      "description": "Bebida refrescante",
      "category": "Bebidas",
      "subcategory": "Gaseosas",
      "price": 2.50,
      "discountPrice": 2.00,
      "stock": 100,
      "images": [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg"
      ],
      "isAvailable": true,
      "createdAt": "2025-12-09T10:00:00.000Z",
      "updatedAt": "2025-12-09T10:00:00.000Z",
      "bodega": {
        "id": "bodega-id-1",
        "name": "Mi Bodega Centro",
        "street": "Calle Principal 123",
        "city": "Guayaquil"
      }
    },
    {
      "id": "clx1234567891",
      "bodegaId": "bodega-id-2",
      "name": "Coca Cola 2L",
      "description": "Bebida refrescante",
      "category": "Bebidas",
      "subcategory": "Gaseosas",
      "price": 2.50,
      "discountPrice": 2.00,
      "stock": 100,
      "images": [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg"
      ],
      "isAvailable": true,
      "createdAt": "2025-12-09T10:00:00.000Z",
      "updatedAt": "2025-12-09T10:00:00.000Z",
      "bodega": {
        "id": "bodega-id-2",
        "name": "Mi Bodega Norte",
        "street": "Av. Norte 456",
        "city": "Guayaquil"
      }
    },
    {
      "id": "clx1234567892",
      "bodegaId": "bodega-id-3",
      "name": "Coca Cola 2L",
      "description": "Bebida refrescante",
      "category": "Bebidas",
      "subcategory": "Gaseosas",
      "price": 2.50,
      "discountPrice": 2.00,
      "stock": 100,
      "images": [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg"
      ],
      "isAvailable": true,
      "createdAt": "2025-12-09T10:00:00.000Z",
      "updatedAt": "2025-12-09T10:00:00.000Z",
      "bodega": {
        "id": "bodega-id-3",
        "name": "Mi Bodega Sur",
        "street": "Calle Sur 789",
        "city": "Guayaquil"
      }
    }
  ]
}
```

## Validaciones Implementadas

### 1. Array Vacío - 400 Bad Request
```json
{
  "bodegaIds": []
}
```
**Error:**
```json
{
  "statusCode": 400,
  "message": ["At least one bodega must be selected"],
  "error": "Bad Request"
}
```

### 2. Bodega No Existe - 404 Not Found
```json
{
  "bodegaIds": ["bodega-valid-id", "bodega-invalid-id", "bodega-nonexistent"]
}
```
**Error:**
```json
{
  "statusCode": 404,
  "message": "Bodegas not found: bodega-invalid-id, bodega-nonexistent",
  "error": "Not Found"
}
```

### 3. Usuario No es Owner - 403 Forbidden
Si el usuario autenticado intenta crear productos en bodegas que no le pertenecen:
```json
{
  "statusCode": 403,
  "message": "You can only create products for your own bodegas. Unauthorized bodegas: Bodega de Juan, Bodega de Maria",
  "error": "Forbidden"
}
```

### 4. Transacción - All or Nothing
Si hay un error durante la creación de cualquier producto (por ejemplo, un constraint de base de datos), NINGÚN producto se creará. La transacción garantiza atomicidad.

## Endpoint Auxiliar: GET /api/bodegas/my-bodegas

Este endpoint ya existe y permite al bodeguero obtener todas sus bodegas:

**Autorización:** Bearer token (rol: BODEGA_OWNER)

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "bodega-id-1",
      "name": "Mi Bodega Centro",
      "description": "Bodega en el centro de la ciudad",
      "street": "Calle Principal 123",
      "city": "Guayaquil",
      "isPrimary": true,
      "isVerified": true,
      "latitude": -2.1894128,
      "longitude": -79.8875449
    },
    {
      "id": "bodega-id-2",
      "name": "Mi Bodega Norte",
      "description": "Bodega en la zona norte",
      "street": "Av. Norte 456",
      "city": "Guayaquil",
      "isPrimary": false,
      "isVerified": true,
      "latitude": -2.1794128,
      "longitude": -79.8975449
    },
    {
      "id": "bodega-id-3",
      "name": "Mi Bodega Sur",
      "description": "Bodega en la zona sur",
      "street": "Calle Sur 789",
      "city": "Guayaquil",
      "isPrimary": false,
      "isVerified": false,
      "latitude": -2.1994128,
      "longitude": -79.8775449
    }
  ]
}
```

Este endpoint es útil para que el frontend muestre un checklist de todas las bodegas del usuario al crear un producto.

## Características Técnicas

### 1. Transaccionalidad
- Usa `prisma.$transaction()` para garantizar atomicidad
- Si falla la creación en una bodega, se hace rollback de todas las operaciones
- Consistencia garantizada

### 2. Validación de Propiedad
- Verifica que el usuario autenticado sea el owner de TODAS las bodegas especificadas
- Mensaje de error detallado indicando qué bodegas no le pertenecen

### 3. Productos Independientes
- Cada producto creado tiene su propio ID único
- Stock independiente por bodega
- Precio y disponibilidad pueden ser modificados independientemente
- Las imágenes se comparten (mismas URLs)

### 4. Relación con Bodega
- La respuesta incluye información de la bodega asociada
- Útil para mostrar en UI sin hacer queries adicionales

## Casos de Uso

### Caso 1: Crear producto en todas las bodegas
Un bodeguero con 5 bodegas quiere agregar un producto nuevo a todas:
1. Llama a `GET /api/bodegas/my-bodegas` para obtener la lista
2. Extrae todos los `id` de las bodegas
3. Llama a `POST /api/products` con el array completo de IDs

### Caso 2: Crear producto solo en bodegas verificadas
Un bodeguero quiere agregar un producto solo a sus bodegas verificadas:
1. Llama a `GET /api/bodegas/my-bodegas`
2. Filtra las bodegas con `isVerified: true`
3. Llama a `POST /api/products` con los IDs filtrados

### Caso 3: Crear producto en una sola bodega
Aunque el sistema soporta múltiples bodegas, también funciona con una sola:
```json
{
  "bodegaIds": ["bodega-id-1"],
  "name": "Producto Único",
  ...
}
```

## Endpoints Relacionados

### Gestión Individual de Productos
Los siguientes endpoints continúan trabajando con productos individuales:

- **PUT /api/products/:id** - Actualizar producto individual
- **DELETE /api/products/:id** - Eliminar producto individual
- **GET /api/products/:id** - Obtener producto individual
- **GET /api/products/bodega/:bodegaId** - Listar productos de una bodega

Estos endpoints NO se ven afectados por el cambio. La gestión post-creación es por producto individual.

## Ejemplos con cURL

### Crear producto en múltiples bodegas
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bodegaIds": ["bodega-id-1", "bodega-id-2"],
    "name": "Arroz Blanco 1kg",
    "description": "Arroz de primera calidad",
    "category": "Alimentos",
    "subcategory": "Granos",
    "price": 1.50,
    "stock": 200,
    "isAvailable": true
  }'
```

### Obtener mis bodegas
```bash
curl -X GET http://localhost:3000/api/bodegas/my-bodegas \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Notas Importantes

1. **Compatibilidad:** El esquema de base de datos NO necesita cambios. La relación Product-Bodega ya existe y es `many-to-one`.

2. **Migración:** Los productos existentes NO se ven afectados. Los productos creados con el endpoint anterior (single bodega) siguen funcionando igual.

3. **Frontend:** El frontend puede seguir usando el endpoint como antes enviando un array de una sola bodega para mantener compatibilidad.

4. **Swagger:** La documentación en `/api/docs` se actualiza automáticamente con los ejemplos del nuevo formato.

## Testing

### Test 1: Creación exitosa
```bash
# Asumiendo que el usuario tiene 3 bodegas
POST /api/products
{
  "bodegaIds": ["bodega-1", "bodega-2", "bodega-3"],
  "name": "Test Product",
  "category": "Test",
  "price": 10,
  "stock": 50
}
# Debe retornar 201 con array de 3 productos
```

### Test 2: Validación de array vacío
```bash
POST /api/products
{
  "bodegaIds": [],
  "name": "Test Product",
  "category": "Test",
  "price": 10,
  "stock": 50
}
# Debe retornar 400 Bad Request
```

### Test 3: Validación de propiedad
```bash
# Intentar crear en bodega de otro usuario
POST /api/products
{
  "bodegaIds": ["bodega-de-otro-usuario"],
  "name": "Test Product",
  "category": "Test",
  "price": 10,
  "stock": 50
}
# Debe retornar 403 Forbidden
```

### Test 4: Validación de existencia
```bash
POST /api/products
{
  "bodegaIds": ["bodega-inexistente-123"],
  "name": "Test Product",
  "category": "Test",
  "price": 10,
  "stock": 50
}
# Debe retornar 404 Not Found
```

### Test 5: Transaccionalidad
```bash
# Simular error en medio de la transacción (requiere test unitario)
# Verificar que si falla uno, ninguno se crea
```

## Archivos Modificados

1. **backend/src/products/dtos/create-product.dto.ts**
   - Cambio: `bodegaId: string` → `bodegaIds: string[]`
   - Validación: `@ArrayMinSize(1)`, `@IsString({ each: true })`

2. **backend/src/products/products.service.ts**
   - Método `create()` completamente reescrito
   - Validación de todas las bodegas
   - Validación de ownership
   - Uso de transacciones

3. **backend/src/products/products.controller.ts**
   - Actualización de decoradores de Swagger
   - Ejemplos de respuesta con array de productos

4. **backend/src/bodegas/bodegas.controller.ts**
   - Sin cambios (endpoint `my-bodegas` ya existía)
