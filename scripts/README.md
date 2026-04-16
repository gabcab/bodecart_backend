# Scripts de Backend

Este directorio contiene scripts útiles para el mantenimiento y desarrollo del backend.

## create-test-users.ts

Script para crear usuarios de prueba en la base de datos. Crea automáticamente:

- 1 usuario **ADMIN**
- 1 usuario **CLIENT** (con dirección de ejemplo)
- 1 usuario **BODEGA_OWNER** (con bodega de ejemplo)
- 1 usuario **DELIVERY_PERSON** (con perfil verificado)

### Uso

```bash
cd backend
npm run users:create
```

### Credenciales Generadas

Todos los usuarios usan la misma contraseña para facilitar las pruebas:

**Contraseña:** `Test123!`

| Rol | Email | Datos Adicionales |
|-----|-------|-------------------|
| ADMIN | admin@bodecart.com | Usuario administrativo |
| CLIENT | cliente@bodecart.com | Dirección: 123 Main Street, NY |
| BODEGA_OWNER | bodeguero@bodecart.com | Bodega: Bodega García (verificada) |
| DELIVERY_PERSON | repartidor@bodecart.com | Vehículo: Bicicleta Azul |

### Características

- **Idempotente**: Usa `upsert` para evitar duplicados. Puedes ejecutar el script múltiples veces sin errores.
- **Contraseñas hasheadas**: Usa bcrypt con 10 rounds (igual que el sistema de autenticación).
- **Datos realistas**: Incluye datos de ejemplo útiles para pruebas.
- **Relaciones completas**: Crea todos los registros relacionados necesarios.

### Qué Crea Exactamente

#### ADMIN
- Usuario con rol ADMIN
- Estado: ACTIVE
- Sin registros adicionales (puede acceder al panel de administración)

#### CLIENT
- Usuario con rol CLIENT
- Perfil de cliente vinculado
- 1 dirección de ejemplo (marcada como predeterminada)
  - Ubicación: New York, NY
  - Coordenadas: 40.7128, -74.0060

#### BODEGA_OWNER
- Usuario con rol BODEGA_OWNER
- Perfil de bodeguero con información de negocio
- 1 bodega de ejemplo (verificada y abierta)
  - Nombre: Bodega García
  - Ubicación: 456 Broadway, NY
  - Horario: 08:00 - 22:00
  - Estado: Verificada

#### DELIVERY_PERSON
- Usuario con rol DELIVERY_PERSON
- Perfil de repartidor verificado
- Información de vehículo (Bicicleta)
- Rating: 4.8
- Estado: Disponible
- Ubicación actual: New York, NY

### Cuándo Usar Este Script

- **Desarrollo local**: Para tener usuarios de prueba rápidamente
- **Testing**: Antes de ejecutar pruebas E2E
- **Demos**: Para mostrar funcionalidad con datos reales
- **Después de reset de BD**: Para repoblar usuarios básicos

### Notas

- El script no elimina usuarios existentes, solo los actualiza si ya existen
- Las contraseñas son simples para facilitar el testing (NO usar en producción)
- Los IDs de dirección y bodega usan UUIDs fijos para permitir upserts
- Todos los usuarios tienen estado ACTIVE y están listos para usar

### Troubleshooting

**Error: Cannot find module '@prisma/client'**
```bash
npm run prisma:generate
```

**Error: Database connection**
Verifica que:
1. PostgreSQL esté corriendo
2. `.env` tenga el `DATABASE_URL` correcto
3. Las migraciones estén aplicadas: `npm run prisma:migrate`

**Error: Foreign key constraint**
Asegúrate de que las migraciones estén aplicadas:
```bash
npx prisma migrate reset  # ⚠️ Esto borrará todos los datos
npx prisma migrate dev
```
