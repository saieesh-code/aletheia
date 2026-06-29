use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::lineage::LineageNode;

pub async fn create_node(
    pool:       &PgPool,
    asset_hash: String,
    parent_id:  Option<Uuid>,
    device_id:  Option<String>,
    operation:  Option<String>,
    metadata:   Option<serde_json::Value>,
) -> Result<LineageNode, AppError> {
    let id    = Uuid::new_v4();
    let op    = operation.unwrap_or_else(|| "capture".to_string());

    // Inherit parent depth + 1, or start at 0
    let depth: i32 = if let Some(pid) = parent_id {
        let row: Option<(i32,)> = sqlx::query_as::<_, (i32,)>(
            "SELECT depth FROM lineage_nodes WHERE id = $1",
        )
        .bind(pid)
        .fetch_optional(pool)
        .await?;

        row.map(|(d,)| d + 1).unwrap_or(0)
    } else {
        0
    };

    let node = sqlx::query_as::<_, LineageNode>(
        r#"
        INSERT INTO lineage_nodes
            (id, parent_id, asset_hash, device_id, operation, metadata, depth)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(parent_id)
    .bind(&asset_hash)
    .bind(&device_id)
    .bind(&op)
    .bind(&metadata)
    .bind(depth)
    .fetch_one(pool)
    .await?;

    Ok(node)
}

/// Return the node and all ancestors, ordered root-first (depth ASC).
pub async fn get_chain(
    pool: &PgPool,
    id:   Uuid,
) -> Result<Vec<LineageNode>, AppError> {
    let nodes = sqlx::query_as::<_, LineageNode>(
        r#"
        WITH RECURSIVE chain AS (
            SELECT * FROM lineage_nodes WHERE id = $1
            UNION ALL
            SELECT n.* FROM lineage_nodes n
            INNER JOIN chain c ON n.id = c.parent_id
        )
        SELECT * FROM chain ORDER BY depth ASC
        "#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    if nodes.is_empty() {
        return Err(AppError::NotFound);
    }

    Ok(nodes)
}

/// Verify that each child's parent_id points to the correct parent.
pub async fn verify_chain(pool: &PgPool, id: Uuid) -> Result<bool, AppError> {
    let chain = get_chain(pool, id).await?;

    // A single-node chain is trivially valid
    if chain.len() < 2 {
        return Ok(true);
    }

    // chain is ordered root-first; verify parent→child links
    for pair in chain.windows(2) {
        let parent = &pair[0];
        let child  = &pair[1];
        if child.parent_id != Some(parent.id) {
            return Ok(false);
        }
    }

    Ok(true)
}
