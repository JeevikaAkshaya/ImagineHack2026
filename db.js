const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

let dbConnection = null;

async function getDatabase() {
  if (dbConnection) return dbConnection;

  dbConnection = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  return dbConnection;
}

async function initDatabase() {
  const db = await getDatabase();

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      last_contact_date TEXT,
      portfolio_value REAL,
      portfolio_performance_change REAL,
      life_events TEXT,
      meeting_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      title TEXT NOT NULL,
      time TEXT,
      date TEXT,
      suggested INTEGER DEFAULT 0,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      description TEXT NOT NULL,
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialty TEXT,
      recent_referral_count INTEGER DEFAULT 0,
      health TEXT DEFAULT 'warm'
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      partner_id INTEGER,
      date TEXT,
      outcome TEXT,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL,
      FOREIGN KEY (partner_id) REFERENCES partners (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS cpd_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL, -- 'structured' or 'unstructured'
      duration TEXT,
      hours REAL NOT NULL,
      completed INTEGER DEFAULT 0,
      description TEXT
    );
  `);

  // Check if data is already seeded
  const clientCount = await db.get('SELECT COUNT(*) as count FROM clients');
  
  if (clientCount.count === 0) {
    console.log('Seeding initial database tables...');

    // Seed Clients
    await db.run(`INSERT INTO clients (name, last_contact_date, portfolio_value, portfolio_performance_change, life_events, meeting_notes) VALUES
      ('David Lim', '2026-05-21', 820000, -0.02, 'Retired, concerned about market stability', 'seeming anxious about market volatility and asking whether to pull out everything. Requires regular reassurance check-ins.'),
      ('Ahmad Razif', '2026-06-05', 450000, -0.08, 'SME owner planning business exit', 'needs a lawyer for his business succession plan and exit strategy. Also has a portfolio drop of 8% recently.'),
      ('Tan Wei Ming', '2026-06-15', 150000, 0.05, 'Married, new business owner', 'New business owner planning exit strategy, meeting scheduled to discuss documents. Needs advice on SME succession planning.'),
      ('Siti Norzaha', '2026-06-18', 1200000, 0.12, 'Pre-retirement, children finishing university', 'portfolio healthy, flagged retirement planning and EPF withdrawal strategies. Wants a roadmap for post-retirement life.')
    `);

    // Seed Schedule
    // Fetch newly created client IDs to map them properly
    const dbClients = await db.all('SELECT id, name FROM clients');
    const david = dbClients.find(c => c.name === 'David Lim');
    const ahmad = dbClients.find(c => c.name === 'Ahmad Razif');
    const tan = dbClients.find(c => c.name === 'Tan Wei Ming');
    const siti = dbClients.find(c => c.name === 'Siti Norzaha');

    await db.run(`INSERT INTO schedule (client_id, title, time, date, suggested) VALUES
      (?, 'Portfolio review', '10:00 AM', '2026-06-20', 0),
      (?, 'Reassurance call', '2:00 PM', '2026-06-20', 1),
      (?, 'Onboarding', '4:30 PM', '2026-06-20', 0)
    `, [siti.id, david.id, tan.id]);

    // Seed Follow-ups
    await db.run(`INSERT INTO follow_ups (client_id, description, due_date, status) VALUES
      (?, 'Send fund prospectus to David', '2026-06-18', 'pending'),
      (?, 'Review SOA for Ahmad', '2026-06-21', 'pending'),
      (?, 'Confirm Tan''s documents', '2026-06-23', 'pending')
    `, [david.id, ahmad.id, tan.id]);

    // Seed Expenses
    await db.run(`INSERT INTO expenses (client_id, category, amount, date) VALUES
      (NULL, 'Client meals', 480.00, '2026-06-15'),
      (NULL, 'Travel', 320.00, '2026-06-16'),
      (NULL, 'Other', 440.00, '2026-06-18')
    `);

    // Seed Partners
    await db.run(`INSERT INTO partners (name, specialty, recent_referral_count, health) VALUES
      ('Encik Farid Hassan', 'Corporate Law & Succession', 3, 'hot'),
      ('Dr. Nurul Aina', 'Takaful & Islamic Finance', 1, 'warm'),
      ('James Tan', 'Tax Consultant', 0, 'cold'),
      ('Lim & Co.', 'Estate Planning & Law', 2, 'warm')
    `);

    // Seed Referrals
    const dbPartners = await db.all('SELECT id, name FROM partners');
    const farid = dbPartners.find(p => p.name === 'Encik Farid Hassan');
    const aina = dbPartners.find(p => p.name === 'Dr. Nurul Aina');
    const lim = dbPartners.find(p => p.name === 'Lim & Co.');

    // Seed some referrals to substantiate the health score calculations
    await db.run(`INSERT INTO referrals (client_id, partner_id, date, outcome) VALUES
      (?, ?, '2026-05-10', 'completed'),
      (?, ?, '2026-05-20', 'completed'),
      (?, ?, '2026-06-01', 'completed'),
      (?, ?, '2026-06-10', 'completed'),
      (?, ?, '2026-06-14', 'pending')
    `, [ahmad.id, farid.id, tan.id, lim.id, siti.id, aina.id, ahmad.id, farid.id, tan.id, farid.id]);

    // Seed CPD Modules
    await db.run(`INSERT INTO cpd_modules (title, category, duration, hours, completed, description) VALUES
      ('EPF & Retirement Strategies', 'structured', '45 min', 3, 0, 'EPF withdrawal strategies, retirement income planning, and annuity options in Malaysia.'),
      ('SME Business Succession', 'structured', '40 min', 2, 0, 'Business continuation, valuation, and buy-sell agreements for local enterprises.'),
      ('Takaful & Islamic Finance', 'structured', '60 min', 4, 1, 'Principles of Shariah compliance in wealth management, family Takaful, and investment-linked products.'),
      ('Estate Planning under Shariah Wasiat law', 'structured', '90 min', 5, 1, 'Islamic inheritance law, Faraid, Hibah, and Wasiat drafting principles in Malaysia.'),
      ('Regulatory Compliance & Ethics', 'structured', '30 min', 3, 1, 'FIMC code of ethics, anti-money laundering (AMLA), and advisor licensing guidelines.'),
      ('Client Communication Skills', 'unstructured', '60 min', 3, 1, 'Active listening, empathy in financial stress, and handling difficult client advisory conversations.')
    `);
  }
}

module.exports = {
  getDatabase,
  initDatabase
};
