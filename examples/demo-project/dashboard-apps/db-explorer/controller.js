const { getPgConnection } = require('./connection-registry');

const routes = [
  {
    method: 'GET',
    path: '/api/tables',
    handler: async (req, res) => {
      const pg = getPgConnection('demo-project');
      const tables = await pg.query(`
        SELECT 
          t.table_name,
          COALESCE(s.n_live_tup, 0) as row_count,
          pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))) as total_size
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s ON t.table_name = s.relname
        WHERE t.table_schema = 'public'
        ORDER BY t.table_name
      `);
      res.json(tables.rows);
    }
  },
  {
    method: 'GET',
    path: '/api/table/:name',
    handler: async (req, res) => {
      const { name } = req.params;
      const pg = getPgConnection('demo-project');
      
      // Get columns
      const columns = await pg.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [name]);

      // Get rows (limit 100)
      const rows = await pg.query(`SELECT * FROM "${name}" LIMIT 100`);
      
      res.json({
        columns: columns.rows,
        rows: rows.rows,
        total: rows.rowCount
      });
    }
  },
  {
    method: 'GET',
    path: '/api/stats',
    handler: async (req, res) => {
      const pg = getPgConnection('demo-project');
      const stats = await pg.query(`
        SELECT 
          schemaname,
          relname as table_name,
          n_live_tup as live_rows,
          n_dead_tup as dead_rows,
          last_vacuum,
          last_autovacuum,
          last_analyze
        FROM pg_stat_user_tables
        ORDER BY relname
      `);
      res.json(stats.rows);
    }
  }
];

module.exports = { routes };
