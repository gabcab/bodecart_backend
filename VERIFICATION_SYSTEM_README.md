# Sistema de Verificación de Documentos - BodeCart

## Resumen

Este sistema permite a los administradores de BodeCart verificar documentos subidos por bodegueros y repartidores, garantizando que solo usuarios verificados puedan operar en la plataforma.

## Características Implementadas

### 1. Modelo de Datos

#### Tablas Nuevas:
- **delivery_person_documents**: Almacena documentos de repartidores (licencia, registro de vehículo, seguro, etc.)

#### Enums Nuevos:
- **DeliveryDocumentType**: Tipos de documentos para repartidores
  - DRIVER_LICENSE
  - VEHICLE_REGISTRATION
  - VEHICLE_INSURANCE
  - BACKGROUND_CHECK
  - PROFILE_PHOTO
  - VEHICLE_PHOTO
  - VEHICLE_PLATE_PHOTO

#### Tablas Existentes Actualizadas:
- **bodega_documents**: Ya existía para documentos de bodegas
- **users**: Relaciones actualizadas para soportar ambos tipos de documentos

### 2. Endpoints para Administradores

Todos los endpoints requieren autenticación JWT y rol ADMIN.

#### GET /api/admin/verification-queue
Lista usuarios pendientes de verificación con filtros.

**Query Parameters:**
- `userType`: "BODEGA_OWNER" | "DELIVERY_PERSON" | "ALL" (default: ALL)
- `status`: "PENDING" | "APPROVED" | "REJECTED" | "ALL" (default: PENDING)
- `page`: número de página (default: 1)
- `limit`: items por página (default: 20)

**Respuesta:**
```json
{
  "items": [
    {
      "id": "user-uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "BODEGA_OWNER",
      "status": "PENDING_VERIFICATION",
      "bodegaOwner": {
        "bodegas": [
          {
            "id": "bodega-uuid",
            "name": "Mi Bodega",
            "documents": [...]
          }
        ]
      }
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

#### GET /api/admin/users/:userId/documents
Ver todos los documentos de un usuario específico.

**Respuesta:**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "DELIVERY_PERSON",
    "status": "PENDING_VERIFICATION"
  },
  "documents": [
    {
      "id": "doc-uuid",
      "type": "DRIVER_LICENSE",
      "fileUrl": "https://s3.../license.pdf",
      "fileName": "license.pdf",
      "fileSize": 1024000,
      "mimeType": "application/pdf",
      "status": "PENDING",
      "createdAt": "2024-01-15T10:00:00Z",
      "reviewedAt": null,
      "reviewedBy": null,
      "rejectionReason": null
    }
  ]
}
```

#### POST /api/admin/documents/bodega/:documentId/approve
Aprobar un documento de bodega.

**Respuesta:**
```json
{
  "id": "doc-uuid",
  "status": "APPROVED",
  "reviewedAt": "2024-01-15T14:30:00Z",
  "reviewedById": "admin-uuid"
}
```

**Lógica automática:**
- Si todos los documentos de la bodega están aprobados:
  - Marca la bodega como `isVerified: true`
  - Actualiza el usuario a `status: ACTIVE`
  - Envía notificación de cuenta verificada

#### POST /api/admin/documents/bodega/:documentId/reject
Rechazar un documento de bodega.

**Body:**
```json
{
  "reason": "El documento está vencido. Por favor sube uno actualizado."
}
```

**Lógica automática:**
- Envía notificación al usuario con la razón del rechazo

#### POST /api/admin/documents/delivery/:documentId/approve
Aprobar un documento de repartidor (misma lógica que bodega).

#### POST /api/admin/documents/delivery/:documentId/reject
Rechazar un documento de repartidor (misma lógica que bodega).

**Body:**
```json
{
  "reason": "La foto del vehículo no es clara. Sube una mejor imagen."
}
```

#### GET /api/admin/stats
Obtener estadísticas del sistema (ya existía, actualizado con nuevos conteos).

**Respuesta incluye:**
```json
{
  "pendingVerifications": {
    "bodegaOwners": 5,
    "deliveryPersons": 3,
    "total": 8
  },
  "pendingDocuments": {
    "bodegaDocuments": 12,
    "deliveryDocuments": 8,
    "total": 20
  },
  "recentActivity": {
    "approvals": {
      "bodegaDocuments": 15,
      "deliveryDocuments": 10,
      "total": 25
    },
    "rejections": {
      "bodegaDocuments": 2,
      "deliveryDocuments": 1,
      "total": 3
    }
  },
  "users": {
    "clients": 1000,
    "bodegaOwners": 200,
    "deliveryPersons": 50,
    "admins": 5,
    "total": 1255
  }
}
```

### 3. Endpoints para Bodegueros/Repartidores

#### POST /api/users/me/documents/upload
Subir documento para verificación.

**Headers:**
- Authorization: Bearer {JWT_TOKEN}

**Body (multipart/form-data):**
- `document`: archivo (PDF, JPG, PNG - máx 10MB)
- `documentType`: tipo de documento (según el rol del usuario)
- `bodegaId`: (opcional, solo para bodegueros con múltiples bodegas)

**Tipos válidos para BODEGA_OWNER:**
- BUSINESS_LICENSE
- EIN
- OWNER_ID
- BANK_INFORMATION
- SALES_TAX_PERMIT
- FOOD_SERVICE_PERMIT
- HEALTH_INSPECTION_REPORT
- LIQUOR_LICENSE
- TOBACCO_LICENSE
- AGE_VERIFICATION_DECLARATION

**Tipos válidos para DELIVERY_PERSON:**
- DRIVER_LICENSE
- VEHICLE_REGISTRATION
- VEHICLE_INSURANCE
- BACKGROUND_CHECK
- PROFILE_PHOTO
- VEHICLE_PHOTO
- VEHICLE_PLATE_PHOTO

**Respuesta:**
```json
{
  "message": "Document uploaded successfully",
  "document": {
    "id": "doc-uuid",
    "type": "DRIVER_LICENSE",
    "fileUrl": "https://s3.../license.pdf",
    "status": "PENDING",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

#### GET /api/users/me/documents
Ver mis documentos subidos.

**Respuesta:**
```json
{
  "documents": [
    {
      "id": "doc-uuid",
      "type": "DRIVER_LICENSE",
      "fileUrl": "https://s3.../license.pdf",
      "fileName": "license.pdf",
      "status": "APPROVED",
      "createdAt": "2024-01-15T10:00:00Z",
      "reviewedAt": "2024-01-15T14:30:00Z"
    },
    {
      "id": "doc-uuid-2",
      "type": "VEHICLE_REGISTRATION",
      "fileUrl": "https://s3.../registration.pdf",
      "fileName": "registration.pdf",
      "status": "REJECTED",
      "rejectionReason": "Documento vencido",
      "createdAt": "2024-01-16T09:00:00Z",
      "reviewedAt": "2024-01-16T11:00:00Z"
    }
  ]
}
```

### 4. Sistema de Notificaciones

Las notificaciones se crean automáticamente en los siguientes casos:

1. **Documento individual aprobado**
   - Título: "Document Approved"
   - Mensaje: "Your {document_type} document has been approved."

2. **Todos los documentos aprobados (cuenta verificada)**
   - Para bodeguero:
     - Título: "Bodega Verified"
     - Mensaje: "Your bodega '{bodega_name}' has been verified and is now active!"
   - Para repartidor:
     - Título: "Account Verified"
     - Mensaje: "Your delivery account has been verified and is now active!"

3. **Documento rechazado**
   - Título: "Document Rejected"
   - Mensaje: "Your {document_type} document was rejected. Reason: {reason}"

### 5. Seguridad

- **Guards implementados:**
  - `JwtAuthGuard`: Verifica token JWT válido
  - `RolesGuard`: Verifica rol de usuario
  - `@Roles` decorator: Especifica roles permitidos por endpoint

- **Validaciones:**
  - Tipo de archivo (solo PDF, JPG, PNG)
  - Tamaño máximo (10MB)
  - Tipos de documentos según rol de usuario
  - Usuario solo puede aprobar/rechazar si es ADMIN

## Instalación y Migración

### 1. Actualizar Base de Datos

**Opción A: Usar Prisma Migrate (recomendado)**
```bash
cd backend
npx prisma migrate dev --name add_delivery_person_documents
npx prisma generate
```

**Opción B: SQL Manual**
Si Prisma Migrate no funciona, ejecuta el archivo `VERIFICATION_SYSTEM_MIGRATION.sql`:
```bash
psql -U postgres -d bodecart < VERIFICATION_SYSTEM_MIGRATION.sql
```

### 2. Regenerar Cliente Prisma
```bash
cd backend
npx prisma generate
```

### 3. Reiniciar Servidor
```bash
npm run start:dev
```

## Pruebas

### 1. Crear usuario administrador (si no existe)
```sql
-- En PostgreSQL
UPDATE users SET role = 'ADMIN', status = 'ACTIVE' WHERE email = 'admin@bodecart.com';
```

### 2. Probar endpoints de admin

**Login como admin:**
```bash
POST http://localhost:3000/auth/login
{
  "email": "admin@bodecart.com",
  "password": "tu_password"
}
```

**Ver cola de verificación:**
```bash
GET http://localhost:3000/admin/verification-queue?status=PENDING
Authorization: Bearer {admin_token}
```

### 3. Probar upload de documentos

**Login como bodeguero o repartidor:**
```bash
POST http://localhost:3000/auth/login
{
  "email": "bodeguero@example.com",
  "password": "password"
}
```

**Subir documento:**
```bash
POST http://localhost:3000/users/me/documents/upload
Authorization: Bearer {user_token}
Content-Type: multipart/form-data

document: [archivo PDF/JPG/PNG]
documentType: "BUSINESS_LICENSE" (o el tipo que corresponda)
bodegaId: "uuid-de-bodega" (opcional)
```

**Ver mis documentos:**
```bash
GET http://localhost:3000/users/me/documents
Authorization: Bearer {user_token}
```

### 4. Probar aprobación/rechazo

**Aprobar documento:**
```bash
POST http://localhost:3000/admin/documents/bodega/{documentId}/approve
Authorization: Bearer {admin_token}
```

**Rechazar documento:**
```bash
POST http://localhost:3000/admin/documents/delivery/{documentId}/reject
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "reason": "El documento está vencido"
}
```

## Flujo Completo de Verificación

1. **Bodeguero/Repartidor se registra**
   - Estado inicial: `PENDING_VERIFICATION`

2. **Usuario sube documentos requeridos**
   - POST /api/users/me/documents/upload
   - Cada documento inicia con status: `PENDING`

3. **Admin revisa documentos**
   - GET /api/admin/verification-queue
   - GET /api/admin/users/:userId/documents

4. **Admin aprueba o rechaza**
   - POST /api/admin/documents/{type}/:documentId/approve
   - POST /api/admin/documents/{type}/:documentId/reject

5. **Sistema verifica si todos los docs están aprobados**
   - Si SÍ:
     - Bodega/DeliveryPerson → `isVerified: true`
     - User → `status: ACTIVE`
     - Notificación de cuenta verificada
   - Si NO:
     - Notificación por documento individual

6. **Usuario puede operar**
   - Solo usuarios con status `ACTIVE` pueden:
     - Bodegueros: crear productos, recibir órdenes
     - Repartidores: aceptar entregas

## Documentación API (Swagger)

Una vez el servidor esté corriendo, visita:
```
http://localhost:3000/api/docs
```

Busca las secciones:
- **Admin**: Endpoints de verificación y gestión
- **Users**: Endpoints de upload de documentos

## Archivos Modificados/Creados

### Nuevos:
- `backend/src/common/guards/roles.guard.ts`
- `backend/src/common/decorators/roles.decorator.ts`
- `backend/src/common/decorators/current-user.decorator.ts`
- `backend/src/admin/dto/verification-queue-query.dto.ts`
- `backend/src/admin/dto/reject-document.dto.ts`
- `backend/VERIFICATION_SYSTEM_MIGRATION.sql`
- `backend/VERIFICATION_SYSTEM_README.md`

### Modificados:
- `backend/prisma/schema.prisma`
- `backend/src/admin/admin.service.ts`
- `backend/src/admin/admin.controller.ts`
- `backend/src/users/users.service.ts`
- `backend/src/users/users.controller.ts`

## Próximos Pasos (Opcional)

1. **Frontend de Admin Panel**
   - Interfaz para ver cola de verificación
   - Vista de documentos con preview de PDFs/imágenes
   - Botones de aprobar/rechazar

2. **Emails de Notificación**
   - Enviar email además de notificación in-app
   - Templates personalizados por tipo de notificación

3. **Webhooks**
   - Notificar a sistemas externos cuando un usuario es verificado

4. **Analytics**
   - Dashboard de tiempo promedio de verificación
   - Tasa de aprobación vs rechazo
   - Documentos más rechazados

## Soporte

Si encuentras problemas:
1. Verifica que la migración se aplicó correctamente
2. Revisa los logs del servidor: `npm run start:dev`
3. Verifica que el usuario tiene el rol correcto en la BD
4. Usa Swagger docs para probar endpoints
