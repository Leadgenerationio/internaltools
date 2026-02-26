import pg from 'pg';

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Get all companies with 0 token balance
  const companies = await client.query(
    `SELECT c.id, c.name, c.plan, c."tokenBalance" FROM "Company" c WHERE c."tokenBalance" = 0`
  );

  if (companies.rows.length === 0) {
    console.log('All companies already have tokens');
    await client.end();
    return;
  }

  const PLAN_TOKENS: Record<string, number> = {
    FREE: 40,
    STARTER: 500,
    PRO: 2500,
    ENTERPRISE: 1000,
  };

  for (const company of companies.rows) {
    const tokens = PLAN_TOKENS[company.plan] || 40;

    // Get the owner user for this company
    const owner = await client.query(
      `SELECT id FROM "User" WHERE "companyId" = $1 AND role = 'OWNER' LIMIT 1`,
      [company.id]
    );
    const userId = owner.rows[0]?.id || null;

    // Update company balance
    await client.query(
      `UPDATE "Company" SET "tokenBalance" = $1 WHERE id = $2`,
      [tokens, company.id]
    );

    // Create token transaction record
    await client.query(
      `INSERT INTO "TokenTransaction" (id, "companyId", "userId", type, amount, "balanceAfter", reason, description, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, 'CREDIT', $3, $3, 'PLAN_ALLOCATION', $4, NOW())`,
      [company.id, userId, tokens, `Initial ${company.plan} plan allocation: ${tokens} tokens`]
    );

    console.log(`Credited ${tokens} tokens to "${company.name}" (${company.plan})`);
  }

  await client.end();
  console.log('Done!');
}

main().catch(console.error);
