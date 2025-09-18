-- Flow Platform Database Schema

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS flow_platform;
USE flow_platform;

-- Users table (for future authentication)
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Groups table
CREATE TABLE flow_groups (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50) NOT NULL DEFAULT 'primary',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Group members table (many-to-many relationship)
CREATE TABLE group_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES flow_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_member (group_id, user_id)
);

-- Flows table
CREATE TABLE flows (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    columns JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Flow nodes table
CREATE TABLE flow_nodes (
    id VARCHAR(36) PRIMARY KEY,
    flow_id VARCHAR(36) NOT NULL,
    node_id VARCHAR(255) NOT NULL,
    node_type VARCHAR(50) NOT NULL,
    position_x DECIMAL(10,2) NOT NULL,
    position_y DECIMAL(10,2) NOT NULL,
    data JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
    UNIQUE KEY unique_flow_node (flow_id, node_id)
);

-- Flow edges table
CREATE TABLE flow_edges (
    id VARCHAR(36) PRIMARY KEY,
    flow_id VARCHAR(36) NOT NULL,
    edge_id VARCHAR(255) NOT NULL,
    source VARCHAR(255) NOT NULL,
    target VARCHAR(255) NOT NULL,
    label VARCHAR(255),
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
    UNIQUE KEY unique_flow_edge (flow_id, edge_id)
);

-- Flow items table
CREATE TABLE flow_items (
    id VARCHAR(36) PRIMARY KEY,
    flow_id VARCHAR(36) NOT NULL,
    data JSON NOT NULL,
    current_node_id VARCHAR(255),
    status ENUM('active', 'completed', 'paused') DEFAULT 'active',
    history JSON,
    path_taken JSON,
    parallel_paths JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
);

-- Insert default groups
INSERT INTO flow_groups (id, name, color) VALUES
('1', 'Development Team', 'primary'),
('2', 'QA Team', 'success'),
('3', 'Management', 'secondary');

-- Insert default users
INSERT INTO users (id, name, email) VALUES
('1', 'John Doe', 'john@example.com'),
('2', 'Jane Smith', 'jane@example.com'),
('3', 'Mike Johnson', 'mike@example.com'),
('4', 'Sarah Wilson', 'sarah@example.com');

-- Insert default group members
INSERT INTO group_members (group_id, user_id) VALUES
('1', '1'), -- John Doe in Development Team
('1', '2'), -- Jane Smith in Development Team
('2', '3'), -- Mike Johnson in QA Team
('3', '4'); -- Sarah Wilson in Management 