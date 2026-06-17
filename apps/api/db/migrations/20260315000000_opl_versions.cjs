/** @type {import("node-pg-migrate").MigrationBuilder} */
exports.up = (pgm) => {
  pgm.createTable({ schema: "truss_internal", name: "opl_versions" }, {
    id: { type: "serial", primaryKey: true },
    tenant_id: { type: "text", notNull: false },
    name: { type: "text", notNull: true, default: "default" },
    content: { type: "text", notNull: true },
    created_by: { type: "text", notNull: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex({ schema: "truss_internal", name: "opl_versions" }, ["tenant_id", "name", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: "truss_internal", name: "opl_versions" });
};
