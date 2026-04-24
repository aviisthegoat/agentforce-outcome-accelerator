import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function listUsers() {
  try {
    const result = await pool.query(
      'SELECT id, username, email, is_admin, created_at FROM users ORDER BY username'
    );

    if (result.rows.length === 0) {
      console.log('No users found in database');
      return;
    }

    console.log('\n📋 Users in database:');
    console.log('─'.repeat(80));
    result.rows.forEach((user, index) => {
      const adminBadge = user.is_admin ? ' [ADMIN]' : '';
      console.log(`${index + 1}. ${user.username}${adminBadge}`);
      if (user.email) console.log(`   Email: ${user.email}`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`);
      console.log('');
    });
    console.log('─'.repeat(80));
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to list users:', error.message);
    process.exit(1);
  }
}

listUsers();


