-- StockFlow MVP reference schema (SQLite-compatible).
-- SQLAlchemy models in models.py are the source of truth and create equivalent schema at startup.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(80) NOT NULL,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_settings (
    organization_id INTEGER PRIMARY KEY,
    default_low_stock_threshold INTEGER NOT NULL DEFAULT 5
        CHECK (default_low_stock_threshold >= 0),
    updated_at DATETIME NOT NULL,
    CONSTRAINT fk_settings_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_users_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    name VARCHAR(120) NOT NULL,
    sku VARCHAR(64) NOT NULL,
    description TEXT,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    cost_price REAL CHECK (cost_price IS NULL OR cost_price >= 0),
    selling_price REAL CHECK (selling_price IS NULL OR selling_price >= 0),
    low_stock_threshold INTEGER CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    last_updated_by INTEGER,
    last_stock_note TEXT,
    CONSTRAINT uq_product_org_sku UNIQUE (organization_id, sku),
    CONSTRAINT fk_products_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_products_last_updated_by FOREIGN KEY (last_updated_by)
        REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_products_organization_id ON products(organization_id);
CREATE INDEX IF NOT EXISTS ix_products_organization_updated ON products(organization_id, updated_at);
CREATE INDEX IF NOT EXISTS ix_products_organization_name ON products(organization_id, name);
