import { Knex } from "knex";

/**
 * Upstream added `name` by editing the original agent migration.
 * Existing DBs that already ran that migration never got the column.
 * This migration adds it safely for those installs.
 */
export async function up(knex: Knex): Promise<void> {
    const hasName = await knex.schema.hasColumn("agent", "name");
    if (!hasName) {
        await knex.schema.alterTable("agent", (table) => {
            table.string("name", 255);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasName = await knex.schema.hasColumn("agent", "name");
    if (hasName) {
        await knex.schema.alterTable("agent", (table) => {
            table.dropColumn("name");
        });
    }
}
