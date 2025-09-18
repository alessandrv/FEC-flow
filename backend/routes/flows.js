const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

const router = express.Router();

// Ensure planner destination columns exist on flows table
async function ensurePlannerColumns() {
  try {
    await pool.execute("ALTER TABLE flows ADD COLUMN IF NOT EXISTS planner_team_id VARCHAR(255) NULL AFTER description");
  } catch (e1) {
    try {
      const [cols] = await pool.execute("SHOW COLUMNS FROM flows LIKE 'planner_team_id'");
      if (!Array.isArray(cols) || cols.length === 0) {
        await pool.execute("ALTER TABLE flows ADD COLUMN planner_team_id VARCHAR(255) NULL AFTER description");
      }
    } catch (e) { console.warn('planner_team_id ensure failed:', e?.message || e) }
  }
  try {
    await pool.execute("ALTER TABLE flows ADD COLUMN IF NOT EXISTS planner_channel_id VARCHAR(255) NULL AFTER planner_team_id");
  } catch (e1) {
    try {
      const [cols] = await pool.execute("SHOW COLUMNS FROM flows LIKE 'planner_channel_id'");
      if (!Array.isArray(cols) || cols.length === 0) {
        await pool.execute("ALTER TABLE flows ADD COLUMN planner_channel_id VARCHAR(255) NULL AFTER planner_team_id");
      }
    } catch (e) { console.warn('planner_channel_id ensure failed:', e?.message || e) }
  }
  try {
    await pool.execute("ALTER TABLE flows ADD COLUMN IF NOT EXISTS planner_plan_id VARCHAR(255) NULL AFTER planner_channel_id");
  } catch (e1) {
    try {
      const [cols] = await pool.execute("SHOW COLUMNS FROM flows LIKE 'planner_plan_id'");
      if (!Array.isArray(cols) || cols.length === 0) {
        await pool.execute("ALTER TABLE flows ADD COLUMN planner_plan_id VARCHAR(255) NULL AFTER planner_channel_id");
      }
    } catch (e) { console.warn('planner_plan_id ensure failed:', e?.message || e) }
  }
  try {
    await pool.execute("ALTER TABLE flows ADD COLUMN IF NOT EXISTS planner_bucket_id VARCHAR(255) NULL AFTER planner_plan_id");
  } catch (e1) {
    try {
      const [cols] = await pool.execute("SHOW COLUMNS FROM flows LIKE 'planner_bucket_id'");
      if (!Array.isArray(cols) || cols.length === 0) {
        await pool.execute("ALTER TABLE flows ADD COLUMN planner_bucket_id VARCHAR(255) NULL AFTER planner_plan_id");
      }
    } catch (e) { console.warn('planner_bucket_id ensure failed:', e?.message || e) }
  }
}

ensurePlannerColumns().catch(e => console.warn('ensurePlannerColumns failed:', e?.message || e));

// Ensure deadlines column exists (JSON) on flows table
async function ensureDeadlinesColumn() {
  try {
    await pool.execute("ALTER TABLE flows ADD COLUMN IF NOT EXISTS deadlines JSON NULL AFTER columns");
  } catch (e1) {
    try {
      const [cols] = await pool.execute("SHOW COLUMNS FROM flows LIKE 'deadlines'");
      if (!Array.isArray(cols) || cols.length === 0) {
        await pool.execute("ALTER TABLE flows ADD COLUMN deadlines JSON NULL AFTER columns");
      }
    } catch (e) { console.warn('deadlines column ensure failed:', e?.message || e); }
  }
}

ensureDeadlinesColumn().catch(e => console.warn('ensureDeadlinesColumn failed:', e?.message || e));

// Helper to sanitize deadlines object (accepts new format: {field: string, days: number} or old format: { key: number >=0 })
function sanitizeDeadlines(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  
  // Check if this is the new format with field and days properties
  if (raw.field !== undefined || raw.days !== undefined) {
    const out = {};
    
    // Validate and include field property (should be a non-empty string)
    if (raw.field && typeof raw.field === 'string' && raw.field.trim().length > 0) {
      out.field = raw.field.trim();
    }
    
    // Validate and include days property (should be a number >= 0)
    if (raw.days !== undefined) {
      const num = Number(raw.days);
      if (Number.isFinite(num) && num >= 0) {
        out.days = num;
      }
    }
    
    return Object.keys(out).length ? out : null;
  }
  
  // Fallback to old format handling (for backward compatibility)
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const num = Number(v);
    if (Number.isFinite(num) && num >= 0) {
      out[k] = num;
    }
  }
  return Object.keys(out).length ? out : null;
}

// Get all flows
router.get('/', async (req, res) => {
  try {
  const [rows] = await pool.execute('SELECT * FROM flows ORDER BY created_at DESC');
    console.log('Found flows:', rows.length);
    
    // For each flow, get its nodes, edges, and items
    const flowsWithDetails = await Promise.all(
      rows.map(async (flow) => {
        try {
          const [nodes] = await pool.execute(
            'SELECT node_id as id, node_type as type, position_x, position_y, data FROM flow_nodes WHERE flow_id = ?',
            [flow.id]
          );
          
          const [edges] = await pool.execute(
            'SELECT edge_id as id, source, target, label, data FROM flow_edges WHERE flow_id = ?',
            [flow.id]
          );
          
          const [items] = await pool.execute(
            'SELECT id, data, current_node_id, status, history, path_taken, parallel_paths, created_at FROM flow_items WHERE flow_id = ?',
            [flow.id]
          );

          return {
            ...flow,
            plannerTeamId: flow.planner_team_id || null,
            plannerChannelId: flow.planner_channel_id || null,
            plannerPlanId: flow.planner_plan_id || null,
            plannerBucketId: flow.planner_bucket_id || null,
            deadlines: (() => {
              try {
                if (flow.deadlines === null || flow.deadlines === undefined) return null;
                if (typeof flow.deadlines === 'object') return flow.deadlines;
                if (typeof flow.deadlines === 'string' && flow.deadlines.trim() !== '') {
                  return JSON.parse(flow.deadlines);
                }
                return null;
              } catch (e) {
                console.warn('Error parsing deadlines for flow', flow.id, e?.message || e);
                return null;
              }
            })(),
            createdAt: flow.created_at,
            updatedAt: flow.updated_at,
            columns: (() => {
              try {
                if (flow.columns === null || flow.columns === undefined) {
                  return [];
                }
                // If it's already an object, return it directly
                if (typeof flow.columns === 'object') {
                  return flow.columns;
                }
                // If it's a string, try to parse it
                if (typeof flow.columns === 'string' && flow.columns !== 'null' && flow.columns !== '') {
                  return JSON.parse(flow.columns);
                }
                return [];
              } catch (error) {
                console.error('Error parsing columns for flow', flow.id, ':', error);
                return [];
              }
            })(),
            nodes: nodes.map(node => ({
              id: node.id, // This is the node_id from the database
              type: node.type, // This is the node_type from the database
              position: { x: parseFloat(node.position_x), y: parseFloat(node.position_y) },
              data: (() => {
                if (node.data === null || node.data === undefined) {
                  return {};
                }
                // If it's already an object, return it directly
                if (typeof node.data === 'object') {
                  return node.data;
                }
                // If it's a string, try to parse it
                if (typeof node.data === 'string' && node.data) {
                  try {
                    return JSON.parse(node.data);
                  } catch (error) {
                    console.error('Error parsing node data:', error);
                    return {};
                  }
                }
                return {};
              })()
            })),
            edges: edges.map(edge => {
              const edgeData = (() => {
                if (edge.data === null || edge.data === undefined) {
                  return {};
                }
                // If it's already an object, return it directly
                if (typeof edge.data === 'object') {
                  return edge.data;
                }
                // If it's a string, try to parse it
                if (typeof edge.data === 'string' && edge.data) {
                  try {
                    return JSON.parse(edge.data);
                  } catch (error) {
                    console.error('Error parsing edge data:', error);
                    return {};
                  }
                }
                return {};
              })();

              // Extract edge type from data and set it at the top level
              const { type, ...restData } = edgeData;
              
              const result = {
                ...edge,
                data: restData // Keep the rest of the data
              };
              
              // Only add type field if it exists and is not null/undefined
              if (type && type !== 'default') {
                result.type = type;
              }
              
              return result;
            }),
            items: items.map(item => ({
              ...item,
              data: (() => {
                if (item.data === null || item.data === undefined) {
                  return {};
                }
                if (typeof item.data === 'object') {
                  return item.data;
                }
                if (typeof item.data === 'string' && item.data) {
                  try {
                    return JSON.parse(item.data);
                  } catch (error) {
                    console.error('Error parsing item data:', error);
                    return {};
                  }
                }
                return {};
              })(),
              history: (() => {
                if (item.history === null || item.history === undefined) {
                  return [];
                }
                if (typeof item.history === 'object') {
                  return item.history;
                }
                if (typeof item.history === 'string' && item.history) {
                  try {
                    return JSON.parse(item.history);
                  } catch (error) {
                    console.error('Error parsing item history:', error);
                    return [];
                  }
                }
                return [];
              })(),
              pathTaken: (() => {
                if (item.path_taken === null || item.path_taken === undefined) {
                  return [];
                }
                if (typeof item.path_taken === 'object') {
                  return item.path_taken;
                }
                if (typeof item.path_taken === 'string' && item.path_taken) {
                  try {
                    return JSON.parse(item.path_taken);
                  } catch (error) {
                    console.error('Error parsing item path_taken:', error);
                    return [];
                  }
                }
                return [];
              })(),
              parallelPaths: (() => {
                if (item.parallel_paths === null || item.parallel_paths === undefined) {
                  return {};
                }
                if (typeof item.parallel_paths === 'object') {
                  return item.parallel_paths;
                }
                if (typeof item.parallel_paths === 'string' && item.parallel_paths) {
                  try {
                    return JSON.parse(item.parallel_paths);
                  } catch (error) {
                    console.error('Error parsing item parallel_paths:', error);
                    return {};
                  }
                }
                return {};
              })(),
              createdAt: item.created_at
            }))
          };
        } catch (flowError) {
          console.error(`Error processing flow ${flow.id}:`, flowError);
          // Return a basic flow object if processing fails
          return {
            ...flow,
            columns: [],
            nodes: [],
            edges: [],
            items: []
          };
        }
      })
    );

    res.json(flowsWithDetails);
  } catch (error) {
    console.error('Error fetching flows:', error);
    res.status(500).json({ error: 'Failed to fetch flows', details: error.message });
  }
});

// Get a single flow by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
  const [flows] = await pool.execute('SELECT * FROM flows WHERE id = ?', [id]);
    if (flows.length === 0) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const flow = flows[0];
    
    const [nodes] = await pool.execute(
      'SELECT node_id as id, node_type as type, position_x, position_y, data FROM flow_nodes WHERE flow_id = ?',
      [id]
    );
    
    const [edges] = await pool.execute(
      'SELECT edge_id as id, source, target, label, data FROM flow_edges WHERE flow_id = ?',
      [id]
    );
    
    const [items] = await pool.execute(
      'SELECT id, data, current_node_id, status, history, path_taken, parallel_paths, created_at FROM flow_items WHERE flow_id = ?',
      [id]
    );

    const flowWithDetails = {
      ...flow,
      plannerTeamId: flow.planner_team_id || null,
      plannerChannelId: flow.planner_channel_id || null,
  plannerPlanId: flow.planner_plan_id || null,
  plannerBucketId: flow.planner_bucket_id || null,
      deadlines: (() => {
        try {
          if (flow.deadlines === null || flow.deadlines === undefined) return null;
          if (typeof flow.deadlines === 'object') return flow.deadlines;
          if (typeof flow.deadlines === 'string' && flow.deadlines.trim() !== '') {
            return JSON.parse(flow.deadlines);
          }
          return null;
        } catch (e) {
          console.warn('Error parsing deadlines for flow', flow.id, e?.message || e);
          return null;
        }
      })(),
      createdAt: flow.created_at,
      updatedAt: flow.updated_at,
      columns: (() => {
        try {
          if (flow.columns === null || flow.columns === undefined) {
            return [];
          }
          // If it's already an object, return it directly
          if (typeof flow.columns === 'object') {
            return flow.columns;
          }
          // If it's a string, try to parse it
          if (typeof flow.columns === 'string' && flow.columns !== 'null' && flow.columns !== '') {
            return JSON.parse(flow.columns);
          }
          return [];
        } catch (error) {
          console.error('Error parsing columns for flow', flow.id, ':', error);
          return [];
        }
      })(),
      nodes: nodes.map(node => ({
        id: node.id, // This is the node_id from the database
        type: node.type, // This is the node_type from the database
        position: { x: parseFloat(node.position_x), y: parseFloat(node.position_y) },
        data: (() => {
          if (node.data === null || node.data === undefined) {
            return {};
          }
          // If it's already an object, return it directly
          if (typeof node.data === 'object') {
            return node.data;
          }
          // If it's a string, try to parse it
          if (typeof node.data === 'string' && node.data) {
            try {
              return JSON.parse(node.data);
            } catch (error) {
              console.error('Error parsing node data:', error);
              return {};
            }
          }
          return {};
        })()
      })),
      edges: edges.map(edge => {
        const edgeData = (() => {
          if (edge.data === null || edge.data === undefined) {
            return {};
          }
          // If it's already an object, return it directly
          if (typeof edge.data === 'object') {
            return edge.data;
          }
          // If it's a string, try to parse it
          if (typeof edge.data === 'string' && edge.data) {
            try {
              return JSON.parse(edge.data);
            } catch (error) {
              console.error('Error parsing edge data:', error);
              return {};
            }
          }
          return {};
        })();

        // Extract edge type from data and set it at the top level
        const { type, ...restData } = edgeData;
        
        const result = {
          ...edge,
          data: restData // Keep the rest of the data
        };
        
        // Only add type field if it exists and is not null/undefined
        if (type && type !== 'default') {
          result.type = type;
        }
        
        return result;
      }),
      items: items.map(item => ({
        ...item,
        data: (() => {
          if (item.data === null || item.data === undefined) {
            return {};
          }
          if (typeof item.data === 'object') {
            return item.data;
          }
          if (typeof item.data === 'string' && item.data) {
            try {
              return JSON.parse(item.data);
            } catch (error) {
              console.error('Error parsing item data:', error);
              return {};
            }
          }
          return {};
        })(),
        history: (() => {
          if (item.history === null || item.history === undefined) {
            return [];
          }
          if (typeof item.history === 'object') {
            return item.history;
          }
          if (typeof item.history === 'string' && item.history) {
            try {
              return JSON.parse(item.history);
            } catch (error) {
              console.error('Error parsing item history:', error);
              return [];
            }
          }
          return [];
        })(),
        pathTaken: (() => {
          if (item.path_taken === null || item.path_taken === undefined) {
            return [];
          }
          if (typeof item.path_taken === 'object') {
            return item.path_taken;
          }
          if (typeof item.path_taken === 'string' && item.path_taken) {
            try {
              return JSON.parse(item.path_taken);
            } catch (error) {
              console.error('Error parsing item path_taken:', error);
              return [];
            }
          }
          return [];
        })(),
        parallelPaths: (() => {
          if (item.parallel_paths === null || item.parallel_paths === undefined) {
            return {};
          }
          if (typeof item.parallel_paths === 'object') {
            return item.parallel_paths;
          }
          if (typeof item.parallel_paths === 'string' && item.parallel_paths) {
            try {
              return JSON.parse(item.parallel_paths);
            } catch (error) {
              console.error('Error parsing item parallel_paths:', error);
              return {};
            }
          }
          return {};
        })(),
        createdAt: item.created_at
      }))
    };

    res.json(flowWithDetails);
  } catch (error) {
    console.error('Error fetching flow:', error);
    res.status(500).json({ error: 'Failed to fetch flow' });
  }
});

// Create a new flow
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
  const { name, description, columns = [], nodes = [], edges = [], items = [], deadlines } = req.body;
    console.log('Creating flow:', { name, description, nodesCount: nodes.length, edgesCount: edges.length, itemsCount: items.length });
    
    // Input validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Flow name is required and must be a non-empty string');
    }
    
    if (!Array.isArray(nodes)) {
      throw new Error('Nodes must be an array');
    }
    
    if (!Array.isArray(edges)) {
      throw new Error('Edges must be an array');
    }
    
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }
    
    if (!Array.isArray(columns)) {
      throw new Error('Columns must be an array');
    }
    
    const flowId = uuidv4();

    // Insert flow
    const sanitizedDeadlines = sanitizeDeadlines(deadlines);
    await connection.execute(
      'INSERT INTO flows (id, name, description, columns, deadlines) VALUES (?, ?, ?, ?, ?)',
      [flowId, name, description, JSON.stringify(columns), sanitizedDeadlines ? JSON.stringify(sanitizedDeadlines) : null]
    );
    console.log('Flow inserted with ID:', flowId);

    // Always create a default starting node if no nodes are provided
    const nodesToInsert = nodes.length > 0 ? nodes : [{
      id: 'initial',
      type: 'initial',
      position: { x: 250, y: 50 },
      data: {
        label: 'Start',
        inputs: [],
        deletable: false // Make it non-deletable
      }
    }];

    // Insert nodes
    for (const node of nodesToInsert) {
      await connection.execute(
        'INSERT INTO flow_nodes (id, flow_id, node_id, node_type, position_x, position_y, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          uuidv4(),
          flowId,
          node.id,
          node.type,
          node.position.x,
          node.position.y,
          JSON.stringify(node.data)
        ]
      );
    }
    console.log('Nodes inserted:', nodesToInsert.length);

    // Insert edges
    for (const edge of edges) {
      await connection.execute(
        'INSERT INTO flow_edges (id, flow_id, edge_id, source, target, label, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          uuidv4(),
          flowId,
          edge.id,
          edge.source,
          edge.target,
          edge.label || null,
          JSON.stringify(edge.data || {})
        ]
      );
    }
    console.log('Edges inserted:', edges.length);

    // Insert items
    for (const item of items) {
      // Convert ISO date string to MySQL datetime format
      let createdAt = null;
      if (item.createdAt) {
        try {
          const date = new Date(item.createdAt);
          createdAt = date.toISOString().slice(0, 19).replace('T', ' ');
        } catch (error) {
          console.error('Error parsing createdAt date:', error);
          createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
      } else {
        createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      }

      await connection.execute(
        'INSERT INTO flow_items (id, flow_id, data, current_node_id, status, history, path_taken, parallel_paths, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          item.id || uuidv4(),
          flowId,
          JSON.stringify(item.data),
          item.currentNodeId || null,
          item.status || 'active',
          JSON.stringify(item.history || []),
          JSON.stringify(item.pathTaken || []),
          JSON.stringify(item.parallelPaths || {}),
          createdAt
        ]
      );
    }
    console.log('Items inserted:', items.length);

    // All operations successful - commit transaction
    await connection.commit();
    
    res.status(201).json({ id: flowId, message: 'Flow created successfully' });
  } catch (error) {
    // CRITICAL: Rollback transaction on any error to prevent partial data
    await connection.rollback();
    
    console.error('Error creating flow:', error);
    res.status(500).json({ 
      error: 'Failed to create flow', 
      details: error.message,
      rollback: 'Transaction rolled back - no partial data was created'
    });
  } finally {
    // Always release the connection
    connection.release();
  }
});

// Update a flow
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
  const { id } = req.params;
  const { name, description, columns, nodes, edges, items, plannerTeamId, plannerChannelId, plannerPlanId, plannerBucketId, deadlines } = req.body;

    // Input validation - prevent processing of invalid data
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid flow ID provided');
    }
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Flow name is required and must be a non-empty string');
    }
    
    if (!Array.isArray(nodes)) {
      throw new Error('Nodes must be an array');
    }
    
    if (!Array.isArray(edges)) {
      throw new Error('Edges must be an array');
    }
    
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }
    
    if (!Array.isArray(columns)) {
      throw new Error('Columns must be an array');
    }

    // Validate that we have at least one node
    if (nodes.length === 0) {
      throw new Error('Flow must have at least one node');
    }

    // Validate that initial node exists
    const hasInitialNode = nodes.some(node => node.type === 'initial');
    if (!hasInitialNode) {
      throw new Error('Flow must have an initial node');
    }

    // Validate node data integrity
    for (const node of nodes) {
      if (!node.id || !node.type || !node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        throw new Error(`Invalid node data: ${JSON.stringify(node)}`);
      }
    }

    // Validate edge data integrity
    for (const edge of edges) {
      if (!edge.id || !edge.source || !edge.target) {
        throw new Error(`Invalid edge data: ${JSON.stringify(edge)}`);
      }
      
      // Ensure source and target nodes exist
      const sourceExists = nodes.some(node => node.id === edge.source);
      const targetExists = nodes.some(node => node.id === edge.target);
      
      if (!sourceExists || !targetExists) {
        throw new Error(`Edge references non-existent nodes: source=${edge.source}, target=${edge.target}`);
      }
    }

    // Step 1: Update flow metadata (safe operation)
    console.log('Backend received deadlines:', deadlines);
    const sanitizedDeadlines = sanitizeDeadlines(deadlines);
    console.log('Backend sanitized deadlines:', sanitizedDeadlines);
    await connection.execute(
      'UPDATE flows SET name = ?, description = ?, planner_team_id = ?, planner_channel_id = ?, planner_plan_id = ?, planner_bucket_id = ?, columns = ?, deadlines = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description, plannerTeamId || null, plannerChannelId || null, plannerPlanId || null, plannerBucketId || null, JSON.stringify(columns), sanitizedDeadlines ? JSON.stringify(sanitizedDeadlines) : null, id]
    );

    // Step 2: Get existing data for comparison and safe updates
    const [existingNodes] = await connection.execute(
      'SELECT node_id, node_type, position_x, position_y, data FROM flow_nodes WHERE flow_id = ?',
      [id]
    );
    
    const [existingEdges] = await connection.execute(
      'SELECT edge_id, source, target, label, data FROM flow_edges WHERE flow_id = ?',
      [id]
    );
    
    const [existingItems] = await connection.execute(
      'SELECT id, data, current_node_id, status, history, path_taken, parallel_paths, created_at FROM flow_items WHERE flow_id = ?',
      [id]
    );

    // Step 3: Safe node updates - only delete/insert what actually changed
    const existingNodeIds = new Set(existingNodes.map(n => n.node_id));
    const newNodeIds = new Set(nodes.map(n => n.id));
    
    // Delete nodes that no longer exist
    const nodesToDelete = Array.from(existingNodeIds).filter(nodeId => !newNodeIds.has(nodeId));
    if (nodesToDelete.length > 0) {
      const placeholders = nodesToDelete.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM flow_nodes WHERE flow_id = ? AND node_id IN (${placeholders})`,
        [id, ...nodesToDelete]
      );
    }
    
    // Update or insert nodes
    for (const node of nodes) {
      const existingNode = existingNodes.find(n => n.node_id === node.id);
      
      if (existingNode) {
        // Update existing node
        await connection.execute(
          'UPDATE flow_nodes SET node_type = ?, position_x = ?, position_y = ?, data = ? WHERE flow_id = ? AND node_id = ?',
          [
            node.type,
            node.position.x,
            node.position.y,
            JSON.stringify(node.data),
            id,
            node.id
          ]
        );
      } else {
        // Insert new node
        await connection.execute(
          'INSERT INTO flow_nodes (id, flow_id, node_id, node_type, position_x, position_y, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            uuidv4(),
            id,
            node.id,
            node.type,
            node.position.x,
            node.position.y,
            JSON.stringify(node.data)
          ]
        );
      }
    }

    // Step 4: Safe edge updates
    const existingEdgeIds = new Set(existingEdges.map(e => e.edge_id));
    const newEdgeIds = new Set(edges.map(e => e.id));
    
    // Delete edges that no longer exist
    const edgesToDelete = Array.from(existingEdgeIds).filter(edgeId => !newEdgeIds.has(edgeId));
    if (edgesToDelete.length > 0) {
      const placeholders = edgesToDelete.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM flow_edges WHERE flow_id = ? AND edge_id IN (${placeholders})`,
        [id, ...edgesToDelete]
      );
    }
    
    // Update or insert edges
    for (const edge of edges) {
      const existingEdge = existingEdges.find(e => e.edge_id === edge.id);
      // Ensure we persist edge.type inside data for round-trip
      const dataToSave = (() => {
        const base = (edge.data && typeof edge.data === 'object') ? { ...edge.data } : {};
        if (edge.type && edge.type !== 'default') {
          base.type = edge.type;
        }
        return base;
      })();
      
      if (existingEdge) {
        // Update existing edge
        await connection.execute(
          'UPDATE flow_edges SET source = ?, target = ?, label = ?, data = ? WHERE flow_id = ? AND edge_id = ?',
          [
            edge.source,
            edge.target,
            edge.label || null,
            JSON.stringify(dataToSave),
            id,
            edge.id
          ]
        );
      } else {
        // Insert new edge
        await connection.execute(
          'INSERT INTO flow_edges (id, flow_id, edge_id, source, target, label, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            uuidv4(),
            id,
            edge.id,
            edge.source,
            edge.target,
            edge.label || null,
            JSON.stringify(dataToSave)
          ]
        );
      }
    }

    // Step 5: Safe item updates - preserve existing items that aren't being updated
    const existingItemIds = new Set(existingItems.map(item => item.id));
    const newItemIds = new Set(items.map(item => item.id));
    
    // Delete items that no longer exist
    const itemsToDelete = Array.from(existingItemIds).filter(itemId => !newItemIds.has(itemId));
    if (itemsToDelete.length > 0) {
      const placeholders = itemsToDelete.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM flow_items WHERE flow_id = ? AND id IN (${placeholders})`,
        [id, ...itemsToDelete]
      );
    }
    
    // Update or insert items
    for (const item of items) {
      const existingItem = existingItems.find(i => i.id === item.id);
      
      if (existingItem) {
        // Update existing item
        await connection.execute(
          'UPDATE flow_items SET data = ?, current_node_id = ?, status = ?, history = ?, path_taken = ?, parallel_paths = ? WHERE flow_id = ? AND id = ?',
          [
            JSON.stringify(item.data),
            item.currentNodeId || null,
            item.status || 'active',
            JSON.stringify(item.history || []),
            JSON.stringify(item.pathTaken || []),
            JSON.stringify(item.parallelPaths || {}),
            id,
            item.id
          ]
        );
      } else {
        // Insert new item
        let createdAt = null;
        if (item.createdAt) {
          try {
            const date = new Date(item.createdAt);
            createdAt = date.toISOString().slice(0, 19).replace('T', ' ');
          } catch (error) {
            console.error('Error parsing createdAt date:', error);
            createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
          }
        } else {
          createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        }

        await connection.execute(
          'INSERT INTO flow_items (id, flow_id, data, current_node_id, status, history, path_taken, parallel_paths, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            item.id,
            id,
            JSON.stringify(item.data),
            item.currentNodeId || null,
            item.status || 'active',
            JSON.stringify(item.history || []),
            JSON.stringify(item.pathTaken || []),
            JSON.stringify(item.parallelPaths || {}),
            createdAt
          ]
        );
      }
    }

    // Step 6: Ensure there's always a starting node (safety check)
    const [finalNodes] = await connection.execute(
      'SELECT COUNT(*) as count FROM flow_nodes WHERE flow_id = ? AND node_type = "initial"',
      [id]
    );
    
    if (finalNodes[0].count === 0) {
      // Create default initial node if none exists
      await connection.execute(
        'INSERT INTO flow_nodes (id, flow_id, node_id, node_type, position_x, position_y, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          uuidv4(),
          id,
          'initial',
          'initial',
          250,
          50,
          JSON.stringify({
            label: 'Start',
            inputs: [],
            deletable: false
          })
        ]
      );
    }

    // All operations successful - commit transaction
    await connection.commit();
    
    res.json({ message: 'Flow updated successfully' });
    
  } catch (error) {
    // CRITICAL: Rollback transaction on any error to prevent data loss
    await connection.rollback();
    
    console.error('Error updating flow:', error);
    res.status(500).json({ 
      error: 'Failed to update flow', 
      details: error.message,
      rollback: 'Transaction rolled back - no data was lost'
    });
  } finally {
    // Always release the connection
    connection.release();
  }
});

// Delete a flow
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete flow (cascading will delete nodes, edges, and items)
    await pool.execute('DELETE FROM flows WHERE id = ?', [id]);
    
    res.json({ message: 'Flow deleted successfully' });
  } catch (error) {
    console.error('Error deleting flow:', error);
    res.status(500).json({ error: 'Failed to delete flow' });
  }
});

module.exports = router; 