const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

const router = express.Router();

// Ensure optional column team_id exists (MySQL 8+ supports IF NOT EXISTS)
async function ensureTeamIdColumn() {
  try {
    await pool.execute("ALTER TABLE flow_groups ADD COLUMN IF NOT EXISTS team_id VARCHAR(255) NULL AFTER color");
  } catch (err) {
    // Older MySQL may not support IF NOT EXISTS; try to detect column first
    try {
      const [cols] = await pool.execute("SHOW COLUMNS FROM flow_groups LIKE 'team_id'");
      if (!Array.isArray(cols) || cols.length === 0) {
        await pool.execute("ALTER TABLE flow_groups ADD COLUMN team_id VARCHAR(255) NULL AFTER color");
      }
    } catch (e) {
      console.warn('Could not ensure team_id column:', e?.message || e);
    }
  }
}

ensureTeamIdColumn().catch((e) => console.warn('ensureTeamIdColumn failed:', e?.message || e));

// Get all groups with their members
router.get('/', async (req, res) => {
  try {
    const [groups] = await pool.execute(`
  SELECT g.*, 
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'name', u.name,
                 'email', u.email
               )
             ) as members
      FROM flow_groups g
      LEFT JOIN group_members gm ON g.id = gm.group_id
      LEFT JOIN users u ON gm.user_id = u.id
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `);

    const formattedGroups = groups.map(group => ({
      id: group.id,
      name: group.name,
      color: group.color,
      team_id: group.team_id || null,
      accept_any: group.accept_any === 1 || group.accept_any === true,
      members: group.members[0] === null ? [] : group.members
    }));

    res.json(formattedGroups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get a single group by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [groups] = await pool.execute(`
  SELECT g.*, 
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'name', u.name,
                 'email', u.email
               )
             ) as members
      FROM flow_groups g
      LEFT JOIN group_members gm ON g.id = gm.group_id
      LEFT JOIN users u ON gm.user_id = u.id
      WHERE g.id = ?
      GROUP BY g.id
    `, [id]);

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = groups[0];
    const formattedGroup = {
      id: group.id,
      name: group.name,
      color: group.color,
      team_id: group.team_id || null,
      accept_any: group.accept_any === 1 || group.accept_any === true,
      members: group.members[0] === null ? [] : group.members
    };

    res.json(formattedGroup);
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Create a new group
router.post('/', async (req, res) => {
  try {
    const { name, color, members, accept_any, team_id } = req.body;
    const groupId = uuidv4();

    // Insert group
    await pool.execute(
      'INSERT INTO flow_groups (id, name, color, team_id, accept_any) VALUES (?, ?, ?, ?, ?)',
      [groupId, name, color, team_id || null, accept_any ? 1 : 0]
    );

    // Insert members
    for (const member of members) {
      // Check if user exists, if not create them
      let [users] = await pool.execute('SELECT id FROM users WHERE email = ?', [member.email]);
      
      let userId;
      if (users.length === 0) {
        userId = uuidv4();
        await pool.execute(
          'INSERT INTO users (id, name, email) VALUES (?, ?, ?)',
          [userId, member.name, member.email]
        );
      } else {
        userId = users[0].id;
      }

      // Add user to group
      await pool.execute(
        'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
        [groupId, userId]
      );
    }

    res.status(201).json({ id: groupId, message: 'Group created successfully' });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update a group
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, members, accept_any, team_id } = req.body;

    // Update group
    await pool.execute(
      'UPDATE flow_groups SET name = ?, color = ?, team_id = ?, accept_any = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, color, team_id || null, accept_any ? 1 : 0, id]
    );

    // Remove existing members
    await pool.execute('DELETE FROM group_members WHERE group_id = ?', [id]);

    // Add new members
    for (const member of members) {
      // Check if user exists, if not create them
      let [users] = await pool.execute('SELECT id FROM users WHERE email = ?', [member.email]);
      
      let userId;
      if (users.length === 0) {
        userId = uuidv4();
        await pool.execute(
          'INSERT INTO users (id, name, email) VALUES (?, ?, ?)',
          [userId, member.name, member.email]
        );
      } else {
        userId = users[0].id;
      }

      // Add user to group
      await pool.execute(
        'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
        [id, userId]
      );
    }

    res.json({ message: 'Group updated successfully' });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Delete a group
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete group (cascading will delete group members)
         await pool.execute('DELETE FROM flow_groups WHERE id = ?', [id]);
    
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

module.exports = router; 