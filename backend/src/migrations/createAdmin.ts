import pool from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

async function createAdmin() {
  const username = process.argv[2];
  const password = process.argv[3];
  const email = process.argv[4] || null;
  
  if (!username || !password) {
    console.error('Usage: tsx src/migrations/createAdmin.ts <username> <password> [email]');
    console.error('Example: tsx src/migrations/createAdmin.ts admin admin123 admin@example.com');
    process.exit(1);
  }

  try {
    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      console.error(`❌ Username "${username}" already exists`);
      process.exit(1);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, is_admin)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, username, email, is_admin, created_at`,
      [id, username, email, passwordHash]
    );

    const user = result.rows[0];
    console.log(`✅ Admin user "${username}" created successfully!`);
    console.log('User details:', {
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin,
      created_at: user.created_at
    });
    console.log(`\n📝 Login credentials:`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to create admin user:', error.message);
    process.exit(1);
  }
}

createAdmin();


