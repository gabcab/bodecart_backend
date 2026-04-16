-- Insertar categorías predeterminadas
INSERT INTO categories (id, name, description, "imageUrl", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Bebidas', 'Categoría de bebidas', 'https://cdn-icons-png.flaticon.com/512/2405/2405479.png', true, NOW(), NOW()),
  (gen_random_uuid(), 'Frutas y Verduras', 'Categoría de frutas y verduras', 'https://cdn-icons-png.flaticon.com/512/1625/1625099.png', true, NOW(), NOW()),
  (gen_random_uuid(), 'Panadería', 'Categoría de panadería', 'https://cdn-icons-png.flaticon.com/512/3081/3081928.png', true, NOW(), NOW()),
  (gen_random_uuid(), 'Lácteos', 'Categoría de lácteos', 'https://cdn-icons-png.flaticon.com/512/869/869869.png', true, NOW(), NOW()),
  (gen_random_uuid(), 'Carnes y Pescados', 'Categoría de carnes y pescados', 'https://cdn-icons-png.flaticon.com/512/1046/1046786.png', true, NOW(), NOW()),
  (gen_random_uuid(), 'Snacks', 'Categoría de snacks', 'https://cdn-icons-png.flaticon.com/512/2553/2553691.png', true, NOW(), NOW()),
  (gen_random_uuid(), 'Alimentos', 'Categoría de alimentos', 'https://cdn-icons-png.flaticon.com/512/706/706195.png', true, NOW(), NOW()),
  (gen_random_uuid(), 'Conservas', 'Categoría de conservas', 'https://cdn-icons-png.flaticon.com/512/3014/3014521.png', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;
